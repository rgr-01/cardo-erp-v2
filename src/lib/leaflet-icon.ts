import L from "leaflet";

// Pin colorido via SVG inline (data URI) — evita depender dos ícones padrão
// do Leaflet (que exigem configurar o caminho dos assets no bundler).
export function pinIcon(cor: string): L.DivIcon {
  const svg = `<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg">
    <path d="M13 0C5.8 0 0 5.8 0 13c0 8.7 13 23 13 23s13-14.3 13-23C26 5.8 20.2 0 13 0z" fill="${cor}" stroke="white" stroke-width="1.5"/>
    <circle cx="13" cy="13" r="5" fill="white"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [26, 36],
    iconAnchor: [13, 36],
    popupAnchor: [0, -32],
  });
}
