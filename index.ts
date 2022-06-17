import type * as Leaflet from "leaflet";

declare const L: typeof Leaflet;

type MarkerInfo = {
  text: string;
  center: [number, number];
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
      const center = [
        (result.bbox[0] + result.bbox[2]) / 2,
        (result.bbox[1] + result.bbox[3]) / 2,
      ].reverse();
      trigger("add-marker", { text, center } as MarkerInfo);
    }
  });
}

export function run() {
  promptForKeys();
  hookupSearch();

  const map = L.map("map").fitWorld();
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  on("add-marker", (markerInfo: MarkerInfo) => {
    const priorMarker = markers.length ? markers[markers.length - 1] : null;
    map.setView(markerInfo.center);
    L.marker(markerInfo.center, {
      title: markerInfo.text,
    }).addTo(map);
    markers.push(markerInfo);
    if (priorMarker) {
      L.polyline([priorMarker.center, markerInfo.center], {
        color: "green",
      }).addTo(map);
    }
    saveMarkers();
  });

  loadMarkers().forEach((m) => markers.push(m));
  if (markers.length) {
    markers.forEach((m) => L.marker(m.center, { title: m.text }).addTo(map));
    map.fitBounds(markers.map((m) => m.center));
    L.polyline(markers.map((m) => m.center)).addTo(map);
  }
}
