// Extrai o primeiro ponto de um KML (formato exportado por Google Earth,
// Google Maps "Meu mapa", etc). Só precisamos de latitude/longitude — sem
// dependência externa, um parser mínimo resolve.

export function extrairPontoKml(xml: string): { lat: number; lon: number } | null {
  const match = xml.match(/<coordinates>\s*([^<]+)\s*<\/coordinates>/i);
  if (!match) return null;
  // Formato: lon,lat[,alt] — pode ter várias coordenadas separadas por
  // espaço/quebra de linha num LineString; pegamos só a primeira.
  const primeira = match[1].trim().split(/\s+/)[0];
  const partes = primeira.split(",");
  if (partes.length < 2) return null;
  const lon = Number(partes[0]);
  const lat = Number(partes[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}
