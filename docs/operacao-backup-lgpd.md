# Backup, restauração e proteção de dados

Este procedimento é a referência operacional do Rede Agro. Ele complementa
os controles do aplicativo; não substitui a definição jurídica de prazos de
guarda para documentos fiscais e contratos.

## Responsáveis e objetivos

O administrador técnico deve executar e registrar as rotinas abaixo. O
administrador da empresa aprova os acessos, os prazos de retenção e qualquer
restauração em produção.

- **RPO alvo:** até 24 horas de dados.
- **RTO alvo:** até 8 horas para restaurar a operação principal.
- **Teste de restauração:** trimestral, em ambiente isolado; nunca sobre o
  banco de produção.

Os objetivos devem ser revisados se a empresa passar a precisar de menor perda
de dados ou de recuperação mais rápida.

## Cópias de segurança

### Banco de dados

1. Confirme no painel do Supabase que há backup diário habilitado e verifique
   o período de retenção contratado.
2. Pelo menos uma vez por mês, gere uma cópia adicional do PostgreSQL usando
   a conexão `DIRECT_URL` (porta de sessão, não o pool transacional) e guarde
   o arquivo criptografado fora do projeto Railway/Supabase.
3. Registre data, responsável, tamanho do arquivo, local seguro e resultado
   no controle interno de operações. Não coloque dumps em Git, Google Drive
   público, e-mail ou computador sem criptografia.

### Arquivos do Supabase Storage

O bucket `relatorios-visita` contém fotos de visitas, comprovantes e PDFs.
Uma cópia do banco não inclui esses objetos.

1. Liste os objetos do bucket e copie-os para um repositório de backup
   privado, com criptografia e acesso restrito.
2. Execute a cópia diariamente, ou antes de qualquer migração relevante.
3. Preserve a estrutura dos caminhos dos arquivos; ela é necessária para os
   registros do banco continuarem apontando para os documentos corretos.
4. Compare a quantidade de objetos e registre falhas de cópia.

## Restauração testada

1. Abra um projeto/ambiente temporário e isolado, sem domínio público.
2. Restaure primeiro o banco em uma base vazia. Aplique as migrações somente
   se o backup for anterior à versão atual do sistema.
3. Restaure os arquivos no bucket privado com os mesmos caminhos.
4. Valide login, clientes, pedidos, uma foto de visita, um PDF assinado e uma
   nota fiscal de exemplo. Não use dados reais para enviar WhatsApp, e-mail,
   NF-e ou webhooks nesse ambiente.
5. Registre tempo gasto, divergências e o resultado. Corrija o procedimento
   antes do próximo teste se o RTO/RPO não forem atendidos.

Em incidente real, a restauração em produção exige aprovação do administrador
da empresa, aviso aos usuários impactados e registro de data/hora, origem do
backup e dados possivelmente perdidos.

## LGPD e acesso

- Mantenha `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `DIRECT_URL`,
  `AUTH_SECRET`, `MOBILE_JWT_SECRET` e chaves de integrações somente nos
  segredos do Railway/GitHub. Nunca em código, arquivos versionados ou prints.
- O bucket de fotos deve permanecer privado; o sistema fornece URLs assinadas
  temporárias para leitura.
- Revise mensalmente usuários administradores e números de WhatsApp
  vinculados. Desative imediatamente quem não faz mais parte da equipe.
- Antes de atender pedido de acesso, correção, anonimização ou eliminação de
  dados, identifique os registros relacionados e valide a obrigação fiscal,
  contratual ou de defesa de direitos que possa exigir retenção.
- Não há exclusão automática de documentos fiscais, pedidos, contratos ou
  comprovantes. O prazo de cada classe de dado deve ser definido e aprovado
  pela empresa com orientação jurídica/contábil.
- Registre solicitações de titulares, a decisão tomada, o responsável e a
  base de retenção aplicável.

## Checklist mensal

- [ ] Backup diário do banco confirmado no Supabase.
- [ ] Cópia externa mais recente do banco conferida.
- [ ] Cópia do Storage conferida.
- [ ] Usuários administradores e vínculos de WhatsApp revisados.
- [ ] Segredos revisados após troca de fornecedor, colaborador ou incidente.
- [ ] Último teste trimestral de restauração registrado.
