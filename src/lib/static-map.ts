// Mini mapa estático gratuito (sem API key) via staticmap.openstreetmap.de,
// usado pra confirmar visualmente a localização de uma visita.

export function gerarUrlMiniMapa(latitude: number, longitude: number): string {
  const params = new URLSearchParams({
    center: `${latitude},${longitude}`,
    zoom: "15",
    size: "500x300",
    maptype: "mapnik",
    markers: `${latitude},${longitude},red-pushpin`,
  });
  return `https://staticmap.openstreetmap.de/staticmap.php?${params.toString()}`;
}

// Imagem de satélite gratuita (sem API key) via Esri World Imagery — mais
// útil pra visita agrícola que o mapa de ruas, dá pra ver a lavoura de cima.
// O pin não vem embutido nessa API (ela só recorta a imagem); é desenhado
// por cima no PDF, sempre no centro da imagem (que é o próprio ponto pedido).
export function gerarUrlMiniMapaSatelite(latitude: number, longitude: number): string {
  const deltaLat = 0.0035; // ~ janela de 400-500m de lado
  const deltaLon = deltaLat / Math.cos((latitude * Math.PI) / 180);
  const bbox = [
    longitude - deltaLon,
    latitude - deltaLat,
    longitude + deltaLon,
    latitude + deltaLat,
  ].join(",");
  const params = new URLSearchParams({
    bbox,
    bboxSR: "4326",
    imageSR: "4326",
    size: "500,300",
    format: "png",
    f: "image",
  });
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${params.toString()}`;
}
