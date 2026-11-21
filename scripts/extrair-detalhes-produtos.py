"""Extrai exclusivamente o layout da tabela Rede Agro 2026-27 V4 (PyMuPDF).
Uso: python scripts/extrair-detalhes-produtos.py caminho.pdf saida.json
Mantém o texto original para auditoria; não importa preços ou cria produtos.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import fitz

origem, destino = map(Path, sys.argv[1:3])
documento = fitz.open(origem)
assert len(documento) == 1, "Layout esperado: uma página"
linhas = [
    {"x": linha["bbox"][0], "y": linha["bbox"][1],
     "texto": " ".join("".join(s["text"] for s in linha["spans"]).split())}
    for bloco in documento[0].get_text("dict")["blocks"] if "lines" in bloco
    for linha in bloco["lines"]
]
produtos = [l for l in linhas if 56 < l["x"] < 58 and l["y"] > 125]
ingredientes = [l for l in linhas if 229 < l["x"] < 231 and l["y"] > 125]
assert len(produtos) == 57, f"Quantidade inesperada: {len(produtos)}"
registros, repetidos = [], []
for linha in produtos:
    texto, y = linha["texto"], linha["y"]
    fornecedor = next(nome for limite, nome in [
        (240, "Koppert"), (255, "Andermatt"), (270, "Rede Agro"),
        (410, "Brandt"), (444, "Gigamix"), (519, "Alvo"), (550, "Analyce")
    ] if y < limite)
    ingrediente = min(ingredientes, key=lambda l: abs(l["y"] - y))
    assert abs(ingrediente["y"] - y) < 1
    partes = re.split(r"\s*\|\s*|\s+I\s+", texto, maxsplit=1)
    cabecalho, recomendacao = partes[0], partes[1] if len(partes) > 1 else None
    embalagem = None
    pacote = re.search(r"\s*-?\s*(cx\d+ds.*|\d+(?:,\d+)?\s*(?:kg|L))$", cabecalho, re.I)
    if pacote:
        embalagem = pacote.group(1)
        cabecalho = cabecalho[:pacote.start()].strip(" -")
    if cabecalho.startswith("MACAN -"):
        cabecalho, recomendacao = cabecalho.split(" - ", 1)
    if cabecalho.startswith("AA") and recomendacao:
        embalagem = "1 sc"
    observacao = None
    if cabecalho in ("SARA", "RAIZEN EVOLUTION"):
        observacao = "Recomendação cortada no PDF; não importada. Consulte o texto original."
        recomendacao = None
    if cabecalho == "ACCERT":
        observacao = "O PDF informa apenas 300ml após o separador; mantido como recomendação, sem inferir embalagem ou dose por hectare."
    registro = dict(fornecedor=fornecedor, produto=cabecalho.strip(), ingredienteAtivo=ingrediente["texto"],
                    embalagem=embalagem, recomendacao=recomendacao, textoOriginal=texto, observacao=observacao)
    anterior = next((r for r in registros if (r["fornecedor"], r["produto"], r["embalagem"]) == (fornecedor, registro["produto"], embalagem)), None)
    if anterior:
        assert anterior == registro, "Duplicata com conteúdo diferente"
        repetidos.append(registro["produto"])
    else:
        registros.append(registro)
destino.parent.mkdir(parents=True, exist_ok=True)
destino.write_text(json.dumps(dict(fonte=origem.name, sha256=hashlib.sha256(origem.read_bytes()).hexdigest(),
                                duplicatasIgnoradas=repetidos, produtos=registros), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"{len(registros)} registros; duplicatas ignoradas: {repetidos}")
