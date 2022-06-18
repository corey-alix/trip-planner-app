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
      name?: string;
      address_line1: string;
      address_line2: string;
      street?: string;
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
    bbox?: number[];
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
  id: number;
  about: string;
  text: string;
  center: L.LatLngLiteral;
}

export function run() {
  const markers = loadMarkers();
  let polyline: Leaflet.Polyline;

  function createMarker(map: Leaflet.Map, markerInfo: MarkerInfo) {
    markerInfo.id = markerInfo.id || uuid();
    const marker = L.marker(markerInfo.center, {
      title: markerInfo.text,
      draggable: false,
      autoPan: true,
    });

    const content = document.createElement("div");
    content.classList.add("marker-content");
    marker.bindPopup(content);

    marker.on("popupopen", () => {
      content.innerHTML = `<label class="title">${markerInfo.text}</label>
      <button data-event="move-marker-backward">Visit Sooner</button>
      <button data-event="move-marker">${
        marker.dragging?.enabled() ? "Dock" : "Move"
      }</button>
      <button data-event="describe-marker">Notes</button>
      <button data-event="delete-marker">Delete</button>
      `;

      const popupElement = marker.getPopup()?.getElement();
      if (!popupElement) return;

      const selectors = [
        "move-marker-backward",
        "delete-marker",
        "move-marker",
        "describe-marker",
      ];
      const [backwardButton, deleteButton, moveButton, describeButton] =
        selectors.map(
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

      moveButton?.addEventListener("click", () => {
        if (marker.dragging?.enabled()) {
          marker.dragging?.disable();
        } else {
          marker.dragging?.enable();
        }
        marker.closePopup();
      });

      describeButton?.addEventListener("click", () => {
        window.location.href = `./pages/describe.html?marker=${markerInfo.id}`;
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
    attributionControl: false,
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

export function runDescribeMarker() {
  applyTriggers();
  const markerId = new URLSearchParams(window.location.search).get("marker");
  if (!markerId) return;
  const markers = loadMarkers();
  const marker = markers.find((m) => m.id + "" === markerId);
  if (!marker) return;
  const target = document.getElementById("data") as HTMLTextAreaElement;
  target.value = marker.about || "";
  on("save", () => {
    marker.about = target.value;
    saveMarkers(markers);
    window.history.back();
  });
  on("back", () => {
    window.history.back();
  });
}

function loadMarkers() {
  const markers = JSON.parse(
    localStorage.getItem("markers") || "[]"
  ) as Array<MarkerInfo>;
  markers.forEach((m) => (m.id = m.id || uuid()));
  return markers;
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
      let text = result.properties.formatted;
      switch (result.type) {
        case "Feature":
          switch (result.properties.result_type) {
            case "building":
              text = `${result.properties.address_line1}`;
              break;
            case "city":
              text = `${result.properties.city}`;
              break;
            case "state":
              text = `${result.properties.state}`;
              break;
            case "county":
              text = result.properties.name!;
              break;
            case "street":
              text = result.properties.street!;
              break;
            default:
              console.log(
                `unknown result_type: ${result.properties.result_type}`
              );
          }
          debugger;
          break;
        default:
          debugger;
      }
      let center: Leaflet.LatLngLiteral | null = null;
      switch (result.geometry.type) {
        case "Point":
          center = {
            lng: result.geometry.coordinates[0],
            lat: result.geometry.coordinates[1],
          };
          break;
        default:
          if (result.bbox) {
            center = {
              lng: (result.bbox[0] + result.bbox[2]) / 2,
              lat: (result.bbox[1] + result.bbox[3]) / 2,
            };
          }
      }
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
function uuid(): number {
  return Date.now().valueOf();
}
