import type * as Leaflet from "leaflet";

declare const L: typeof Leaflet;

type MarkerInfo = {
  text: string;
  center: L.LatLngLiteral;
};

const markers = [] as Array<MarkerInfo>;

function saveMarkers() {
  localStorage.setItem("markers", JSON.stringify(markers));
}

function loadMarkers() {
  return JSON.parse(
    localStorage.getItem("markers") || "[]"
  ) as Array<MarkerInfo>;
}

// raise an HTML event
function trigger(trigger: string, node?: any) {
  if (!trigger) return;
  const event = new CustomEvent(trigger, {
    detail: {
      message: trigger,
      node,
    },
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
}

// listen for a dispatched event
function on(trigger: string, callback: (node: any) => void) {
  document.addEventListener(trigger, (e: CustomEventInit) => {
    callback(e.detail.node);
  });
}

const globals = {
  geoapify: {
    about: "geoapify key",
    key: "9bae5097c2ab40e7af125fe7c7d03021",
  },
};

const geocodeResponseSample = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: {
        datasource: {
          sourcename: "openstreetmap",
          attribution: "© OpenStreetMap contributors",
          license: "Open Database License",
          url: "https://www.openstreetmap.org/copyright",
        },
        city: "Greenville",
        county: "Pitt County",
        state: "North Carolina",
        country: "United States",
        country_code: "us",
        town: "Greenville",
        lon: -77.3724593,
        lat: 35.613224,
        state_code: "NC",
        formatted: "Greenville, NC, United States of America",
        address_line1: "Greenville, NC",
        address_line2: "United States of America",
        category: "administrative",
        result_type: "city",
        rank: {
          importance: 0.6179463889129814,
          popularity: 1.879140678121031,
          confidence: 1,
          confidence_city_level: 1,
          match_type: "full_match",
        },
        place_id:
          "51d425885fd65753c059a88fc01f7ece4140f00101f9010fbf020000000000c00208",
      },
      geometry: { type: "Point", coordinates: [-77.3724593, 35.613224] },
      bbox: [-77.475265, 35.529776, -77.279305, 35.676051],
    },
  ],
  query: {
    text: "greenville, nc",
    parsed: { city: "greenville", state: "nc", expected_type: "city" },
  },
};

type GeocodeReponse = typeof geocodeResponseSample;

function promptForKey(key: keyof typeof globals) {
  const value = prompt(`Enter value for ${globals[key].about}`);
  if (!value) return "";
  globals[key].key = value;
  return value;
}

function promptForKeys() {
  const keys = Object.keys(globals) as Array<keyof typeof globals>;
  keys.forEach((k) => {
    let value = localStorage.getItem(k) as string;
    if (!value) {
      value = promptForKey(k);
      if (value) localStorage.setItem(k, value);
    }
  });
}

async function geocode(search: string) {
  const response = await fetch(
    `https://api.geoapify.com/v1/geocode/search?text=${search}&apiKey=${globals.geoapify.key}`
  );
  const data = (await response.json()) as GeocodeReponse;
  return data;
}

function hookupSearch() {
  const input = document.getElementById("search") as HTMLInputElement;
  input.addEventListener("change", async () => {
    const search = input.value;
    input.select();
    const searchResults = await geocode(search);
    if (searchResults.features.length) {
      const result = searchResults.features[0];
      const text = result.properties.formatted;
      const center = {
        lng: (result.bbox[0] + result.bbox[2]) / 2,
        lat: (result.bbox[1] + result.bbox[3]) / 2,
      };
      const markerInfo = { text, center } as MarkerInfo;
      trigger("add-marker", { markerInfo });
    }
  });
}

export function run() {
  promptForKeys();
  hookupSearch();
  upgradeDatabase();

  const map = L.map("map", {
    zoomControl: false,
  }).fitWorld();

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  map.on("move", () => {
    localStorage.setItem("mapCenter", JSON.stringify(map.getCenter()));
    localStorage.setItem("mapZoom", JSON.stringify(map.getZoom()));
  });

  on("add-marker", (info: { markerInfo: MarkerInfo }) => {
    const { markerInfo } = info;
    const priorMarker = markers.length ? markers[markers.length - 1] : null;
    map.setView(markerInfo.center);

    createMarker(map, markerInfo);
    markers.push(markerInfo);

    if (priorMarker) {
      L.polyline([priorMarker.center, markerInfo.center], {
        color: "green",
      }).addTo(map);
    }
    saveMarkers();
  });

  on("delete-marker", (data: { markerInfo: MarkerInfo }) => {
    const { markerInfo } = data;
    const index = markers.indexOf(markerInfo);
    if (index > -1) {
      markers.splice(index, 1);
    }
    drawPolylines(map);
  });

  on("move-marker-backward", (data: { markerInfo: MarkerInfo }) => {
    const { markerInfo } = data;
    const index = markers.indexOf(markerInfo);
    if (index > 0) {
      const temp = markers[index - 1];
      markers[index - 1] = markerInfo;
      markers[index] = temp;
    }
    drawPolylines(map);
  });

  const center = JSON.parse(
    localStorage.getItem("mapCenter") || "null"
  ) as Leaflet.LatLngLiteral;

  const zoom = JSON.parse(localStorage.getItem("mapZoom") || "0") as number;

  if (center) {
    map.setView(center, zoom);
  }

  loadMarkers().forEach((m) => markers.push(m));

  drawPolylines(map);

  if (markers.length) {
    markers.forEach((m) => createMarker(map, m));
    const bounds = markers.map(
      (m) => [m.center.lat, m.center.lng] as Leaflet.LatLngTuple
    );
    if (!center) map.fitBounds(bounds);
  }
}
function createMarker(map: Leaflet.Map, markerInfo: MarkerInfo) {
  const marker = L.marker(markerInfo.center, {
    title: markerInfo.text,
    draggable: true,
    autoPan: true,
  });
  marker.bindPopup(
    `<h2>${markerInfo.text}</h2>
    <button data-event="move-marker-backward">Visit Sooner</button>
    <button data-event="delete-marker">Delete</button>
    `
  );

  marker.on("popupopen", () => {
    const popupElement = marker.getPopup()?.getElement();
    if (!popupElement) return;

    const selectors = ["move-marker-backward", "delete-marker"];
    const [backwardButton, deleteButton] = selectors.map(
      (id) =>
        popupElement.querySelector(
          `button[data-event='${id}']`
        ) as HTMLButtonElement
    );

    deleteButton?.addEventListener("click", () => {
      marker.remove();
      trigger("delete-marker", { markerInfo });
    });

    backwardButton?.addEventListener("click", () => {
      trigger("move-marker-backward", { markerInfo });
    });
  });

  marker.on("dragend", () => {
    const { lat, lng } = marker.getLatLng();
    markerInfo.center = { lat, lng };
    saveMarkers();
    drawPolylines(map);
  });

  marker.addTo(map);
  return marker;
}

let polyline: Leaflet.Polyline;

function drawPolylines(map: Leaflet.Map) {
  const bounds = markers.map(
    (m) => [m.center.lat, m.center.lng] as Leaflet.LatLngTuple
  );
  if (polyline) polyline.remove();
  polyline = L.polyline(bounds, {
    color: "green",
  }).addTo(map);
}

function upgradeDatabase() {
  const version = localStorage.getItem("version");
  if (!version) {
    localStorage.setItem("version", "1");
    localStorage.setItem("markers", "[]");
  }
}
