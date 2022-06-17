import type * as Leaflet from "leaflet";

declare const L: typeof Leaflet;

interface GeocodeReponse {
  type: string;
  features: {
    type: string;
    properties: {
      datasource: {
        sourcename: string;
        attribution: string;
        license: string;
        url: string;
      };
      city: string;
      county: string;
      state: string;
      country: string;
      country_code: string;
      town: string;
      lon: number;
      lat: number;
      state_code: string;
      formatted: string;
      address_line1: string;
      address_line2: string;
      category: string;
      result_type: string;
      rank: {
        importance: number;
        popularity: number;
        confidence: number;
        confidence_city_level: number;
        match_type: string;
      };
      place_id: string;
    };
    geometry: {
      type: string;
      coordinates: number[];
    };
    bbox: number[];
  }[];
  query: {
    text: string;
    parsed: {
      city: string;
      state: string;
      expected_type: string;
    };
  };
}

interface MarkerInfo {
  text: string;
  center: L.LatLngLiteral;
}

export function run() {
  const markers = loadMarkers();
  let polyline: Leaflet.Polyline;

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
      saveMarkers(markers);
      drawPolylines(map);
    });

    marker.addTo(map);
    return marker;
  }

  function drawPolylines(map: Leaflet.Map) {
    const bounds = markers.map(
      (m) => [m.center.lat, m.center.lng] as Leaflet.LatLngTuple
    );
    if (polyline) polyline.remove();
    polyline = L.polyline(bounds, {
      color: "green",
    }).addTo(map);
  }

  applyTriggers();
  {
    const adminMenuDom = document.querySelector(
      "#admin-menu"
    ) as HTMLSelectElement;
    adminMenuDom.value = "";
    adminMenuDom.addEventListener("change", () => {
      Array.from(adminMenuDom.selectedOptions).forEach((option) => {
        const event = option.getAttribute("data-trigger");
        if (event) trigger(event);
        adminMenuDom.value = "";
      });
    });
  }
  promptForKeys();
  hookupSearch();
  upgradeDatabase();

  on("open-export-form", () => {
    window.location.href = "./pages/export.html";
  });

  on("open-import-form", () => {
    window.location.href = "./pages/import.html";
  });

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
    map.setView(markerInfo.center);

    createMarker(map, markerInfo);
    markers.push(markerInfo);

    saveMarkers(markers);
    drawPolylines(map);
  });

  on("delete-marker", (data: { markerInfo: MarkerInfo }) => {
    const { markerInfo } = data;
    const index = markers.indexOf(markerInfo);
    if (index > -1) {
      markers.splice(index, 1);
      drawPolylines(map);
      toaster("Marker Deleted");
    }
  });

  on("move-marker-backward", (data: { markerInfo: MarkerInfo }) => {
    const { markerInfo } = data;
    const index = markers.indexOf(markerInfo);
    if (index > 0) {
      const temp = markers[index - 1];
      markers[index - 1] = markerInfo;
      markers[index] = temp;
      saveMarkers(markers);
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

  drawPolylines(map);

  if (markers.length) {
    markers.forEach((m) => createMarker(map, m));
    const bounds = markers.map(
      (m) => [m.center.lat, m.center.lng] as Leaflet.LatLngTuple
    );
    if (!center) map.fitBounds(bounds);
  }
}

export function runExport() {
  applyTriggers();
  const markers = loadMarkers();
  const target = document.getElementById("data") as HTMLTextAreaElement;
  target.value = JSON.stringify(markers, null, "  ");
  target.select();

  on("copy-to-clipboard", () => {
    const data = target.value;
    navigator.clipboard.writeText(data);
    toaster("Waypoints copied to clipboard");
  });
}

export function runImport() {
  applyTriggers();
  const target = document.getElementById("data") as HTMLTextAreaElement;

  on("import-waypoints", () => {
    const data = JSON.parse(target.value) as MarkerInfo[];
    saveMarkers(data);
    window.location.href = "../index.html";
  });
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

function upgradeDatabase() {
  const version = localStorage.getItem("version");
  if (!version) {
    localStorage.setItem("version", "1");
    localStorage.setItem("markers", "[]");
  }
}

function applyTriggers(scope: HTMLElement | Document = document) {
  const triggers = Array.from(
    scope.querySelectorAll("[data-trigger]")
  ) as Array<HTMLInputElement>;
  triggers.forEach((e) => {
    const eventName = e.getAttribute("data-trigger");
    if (!eventName) return;
    let enabled = false;

    const doit = debounce(() => {
      trigger(eventName, e);
      if (!enabled) return;
      requestAnimationFrame(doit);
    }, 100);

    if (e.classList.contains("as-keypress")) {
      e.addEventListener("mousedown", (e) => {
        enabled = true;
        doit();
        e.preventDefault();
      });

      e.addEventListener("touchstart", (e) => {
        enabled = true;
        doit();
        e.preventDefault();
      });

      e.addEventListener("mouseup", (e) => {
        enabled = false;
        e.preventDefault();
      });

      e.addEventListener("touchend", (e) => {
        enabled = false;
        e.preventDefault();
      });
    } else {
      e.addEventListener("click", () => {
        trigger(eventName, e);
      });
    }
  });
}

function toaster(message: string) {
  const toaster = document.getElementById("toaster") as HTMLDivElement;
  if (!toaster) {
    alert(message);
    return;
  }
  toaster.classList.remove("hidden");
  toaster.innerText = message;
  setTimeout(() => {
    toaster.classList.add("hidden");
  }, 1000);
}

function debounce<T extends Function>(cb: T, wait = 20) {
  let h = 0;
  let callable = (...args: any) => {
    clearTimeout(h);
    h = setTimeout(() => cb(...args), wait);
  };
  return <T>(<any>callable);
}

function saveMarkers(markers: MarkerInfo[]) {
  localStorage.setItem("markers", JSON.stringify(markers));
}
