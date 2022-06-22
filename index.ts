import * as Leaflet from "leaflet";

declare const L: typeof Leaflet;

interface GeocodeResult {
  text: string;
  center: {
    lat: number;
    lng: number;
  };
}

interface GoogleGeocoderResponse {
  results: Array<{
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: Array<string>;
    }>;
    formatted_address: string;
    geometry: {
      location: Leaflet.LatLngLiteral;
      location_type: "GEOMETRIC_CENTER";
      viewport: {
        northeast: Leaflet.LatLngLiteral;
        southwest: Leaflet.LatLngLiteral;
      };
    };
    partial_match: boolean;
    place_id: string;
    plus_code: {
      compound_code: string;
      global_code: string;
    };
    types: Array<string>;
  }>;
  status: "OK" | "?";
}

const tiles = {
  alidade_smooth_dark:
    "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
  outdoors: "https://tiles.stadiamaps.com/tiles/outdoors/{z}/{x}/{y}{r}.png",
  osm: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
};

interface GeoapifyGeocodeResultFeature {
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
}

interface GeoapifyGeocodeReponse {
  type: string;
  features: GeoapifyGeocodeResultFeature[];
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
  arrivalDate?: string;
  departureDate?: string;
  optional?: boolean;
}

export function run() {
  const state = {
    markerInfo: null as MarkerInfo | null,
    marker: null as Leaflet.Marker | null,
    markers: loadMarkers(),
    markerHash: new Map<number, Leaflet.Marker>(),
  };

  // extract query param for "center"
  const centerQueryParam = new URLSearchParams(window.location.search).get(
    "center"
  );

  let polyline: Leaflet.Polyline;
  const input = document.getElementById("search") as HTMLInputElement;

  const icons = {
    smallIcon: new L.Icon({
      iconUrl: "./assets/marker-icon.png",
      iconSize: [6 * ICON_SCALE, 10 * ICON_SCALE],
      iconAnchor: [3 * ICON_SCALE, 10 * ICON_SCALE],
    }),
    largeIcon: new L.Icon({
      iconUrl: "./assets/marker-icon.png",
      iconSize: [12 * ICON_SCALE, 20 * ICON_SCALE],
      iconAnchor: [6 * ICON_SCALE, 20 * ICON_SCALE + 3],
    }),
  };

  function createMarker(map: Leaflet.Map, markerInfo: MarkerInfo) {
    markerInfo.id = markerInfo.id || uuid();
    const marker = L.marker(markerInfo.center, {
      title: markerInfo.text,
      draggable: false,
      autoPan: true,
      opacity: markerInfo.optional ? 0.5 : 1,
      icon: markerInfo.arrivalDate ? icons.largeIcon : icons.smallIcon,
    });

    const actionState = {
      mapMarker: marker,
      marker: markerInfo,
      markers: state.markers,
    };

    [GotoPriorMarkerAction, GotoNextMarkerAction].forEach((Action) => {
      injectAction(actionState, new Action());
    });

    state.marker = marker;
    state.markerInfo = markerInfo;

    const content = document.createElement("div");
    content.classList.add("marker-content", "grid-2");
    marker.bindPopup(content);

    marker.on("popupopen", () => {
      const date = new Date(
        computeArrivalDate(state.markers, markerInfo.id)
      ).toDateString();
      content.innerHTML = `<label class="title col1-2 bold">${date}</label><label class="title col1-2">${
        markerInfo.text
      }</label>
      <div class="col1 grid-2">
      <button class="col1-2" type="button" data-trigger="directions-to-marker">Find Directions</button>
      <button class="col1-2" type="button" data-trigger="move-marker-backward">Visit Sooner</button>
      <button class="col1-2" type="button" data-trigger="move-marker">${
        marker.dragging?.enabled() ? "Prevent Dragging" : "Allow Dragging"
      }</button>
      </div>
      <div class="col2 grid-2">
      <button class="col1-2"  type="button" data-trigger="describe-marker">Edit Notes</button>
      <button class="col1-2"  type="button" data-trigger="delete-marker">Remove from Route</button>
      <button class="col1-2"  type="button" data-trigger="insert-stop">Insert Stop</button>
      </div>
      `;

      const popupElement = marker.getPopup()?.getElement();
      if (!popupElement) return;

      applyTriggers(popupElement);
      state.marker = marker;
      state.markerInfo = markerInfo;
    });

    marker.on("dragend", () => {
      const { lat, lng } = marker.getLatLng();
      markerInfo.center = { lat, lng };
      saveMarkers(state.markers);
      decorateStops(map);
    });

    marker.addTo(map);
    state.markerHash.set(markerInfo.id, marker);
    return marker;
  }

  function decorateStops(map: Leaflet.Map) {
    const bounds = state.markers.map(
      (m) => [m.center.lat, m.center.lng] as Leaflet.LatLngTuple
    );
    if (polyline) polyline.remove();
    polyline = L.polyline(bounds, {
      color: "green",
      dashArray: "1, 16",
    }).addTo(map);

    let firstArrivalDate: Date;
    let priorDepartureDate: Date;
    state.markers.forEach((m) => {
      let title = "";
      if (m.arrivalDate) {
        const arrivalDate = new Date(m.arrivalDate!);
        firstArrivalDate = firstArrivalDate || arrivalDate;
        const firstDay =
          epochDays(arrivalDate) - epochDays(firstArrivalDate) + 1;
        title = `${firstDay}`;
        L.marker(m.center, {
          icon: L.divIcon({
            iconAnchor: [5, 80],
            html: `<p class="shadow visit overnight">${title}</p>`,
            className: "text-below-marker",
          }),
        }).addTo(map);
      } else if (priorDepartureDate) {
        title = DAYS[priorDepartureDate.getDay()];
        L.marker(m.center, {
          icon: L.divIcon({
            iconAnchor: [30, 30],
            html: `<p class="shadow visit no-overnight">${title}</p>`,
            className: "text-below-marker",
          }),
        }).addTo(map);
      }
      if (m.departureDate) {
        priorDepartureDate = new Date(m.departureDate);
      }
    });
  }

  function hookupSearch() {
    input.addEventListener("change", async () => {
      const search = input.value;
      input.select();
      let near = map.getCenter() as Leaflet.LatLngLiteral;
      if (state.markerInfo?.center) near = state.markerInfo?.center;
      const rawResults = await GoogleApi.geocode(search, near);
      const searchResults = GoogleApi.normalize(rawResults);
      if (searchResults.length) {
        const result = searchResults[0];
        const text = result.text;
        let center = result.center;
        const markerInfo = { text, center } as MarkerInfo;
        markerInfo.about = `search: ${input.value}\n${markerInfo.about || ""}`;
        trigger("add-marker", { markerInfo });
      }
    });
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

  on("popup", (args: { marker: MarkerInfo }) => {
    const marker = state.markerHash.get(args.marker.id);
    map.flyTo(args.marker.center);
    marker?.openPopup();
  });

  on("insert-stop", () => {
    const thisMarker = state.markerInfo;
    if (!thisMarker) return;
    const currentIndex = state.markers.indexOf(thisMarker);
    const nextMarker = state.markers[currentIndex + 1];
    if (!nextMarker) return;

    const newInfo: MarkerInfo = {
      id: uuid(),
      about: "inserted stop",
      text: "inserted stop",
      center: {
        lat: (thisMarker.center.lat + nextMarker.center.lat) / 2,
        lng: (thisMarker.center.lng + nextMarker.center.lng) / 2,
      },
    };

    // insert the new info
    state.markers.splice(currentIndex + 1, 0, newInfo);
    saveMarkers(state.markers);
    decorateStops(map);
    createMarker(map, newInfo).openPopup();
  });

  on("toggle-search", () => {
    input.classList.toggle("hidden");
  });

  on("delete-marker", () => {
    if (!state.marker) return;
    state.marker.remove();
  });

  on("move-marker", () => {
    if (!state.marker) return;
    if (state.marker.dragging?.enabled()) {
      state.marker.dragging?.disable();
    } else {
      state.marker.dragging?.enable();
    }
    state.marker.closePopup();
  });

  on("describe-marker", () => {
    if (!state.markerInfo) return;
    window.location.href = `./pages/describe.html?marker=${state.markerInfo.id}`;
  });

  on("open-export-form", () => {
    window.location.href = "./pages/export.html";
  });

  on("open-import-form", () => {
    window.location.href = "./pages/import.html";
  });

  on("directions-to-marker", () => {
    const to = state.markerInfo;
    if (!to) return;
    const from = state.markers[state.markers.indexOf(to) - 1];
    if (!from) {
      window.location.href = `https://www.google.com/maps/place/${to.center.lat},${to.center.lng}`;
    } else {
      // https://www.google.com/maps?saddr=My+Location&daddr=43.12345,-76.12345
      window.location.href = `https://www.google.com/maps?saddr=${from.center.lat},${from.center.lng}&daddr=${to.center.lat},${to.center.lng}`;
    }
  });

  const map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer(tiles.outdoors, {
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

    createMarker(map, markerInfo).openPopup();
    state.markers.push(markerInfo);

    saveMarkers(state.markers);
    decorateStops(map);
  });

  on("delete-marker", () => {
    const { markers, markerInfo } = state;
    if (!markers || !markerInfo) return;
    const index = markers.indexOf(markerInfo);
    if (index > -1) {
      markers.splice(index, 1);
      decorateStops(map);
      saveMarkers(state.markers);
      toaster("Marker Deleted");
    }
  });

  on("move-marker-backward", () => {
    const { markers, markerInfo } = state;
    if (!markers || !markerInfo) return;
    const index = markers.indexOf(markerInfo);
    if (index > 0) {
      const temp = markers[index - 1];
      markers[index - 1] = markerInfo;
      markers[index] = temp;
      saveMarkers(markers);
    }
    decorateStops(map);
  });

  const zoom = JSON.parse(localStorage.getItem("mapZoom") || "0") as number;

  let center = JSON.parse(
    localStorage.getItem("mapCenter") || "null"
  ) as Leaflet.LatLngLiteral;

  if (centerQueryParam) {
    center = JSON.parse(centerQueryParam) as Leaflet.LatLngLiteral;
  }

  if (center) {
    map.setView(center, zoom);
  } else {
    map.fitWorld();
  }

  decorateStops(map);

  if (state.markers.length) {
    state.markers.forEach((m) => createMarker(map, m));
    const bounds = state.markers.map(
      (m) => [m.center.lat, m.center.lng] as Leaflet.LatLngTuple
    );
    if (!center) map.fitBounds(bounds);
  }
}

function getFeatureLocation(
  result: GeoapifyGeocodeResultFeature
): Leaflet.LatLngLiteral | null {
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
  return center;
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

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function runDescribeMarker() {
  promptForKeys();
  const arrivalDate = document.getElementById(
    "date-of-arrival"
  ) as HTMLInputElement;

  const departureDate = document.getElementById(
    "date-of-departure"
  ) as HTMLInputElement;
  const isOvernight = document.getElementById(
    "is-overnight-visit"
  ) as HTMLInputElement;

  const reactive = {
    ".arrival-date-label": (dom: HTMLElement) => {
      arrivalDate.addEventListener("change", () => {
        const text = arrivalDate.value
          ? `Arrive ${DAYS[new Date(arrivalDate.value).getDay()]}`
          : "Arrive: ";
        dom.innerHTML = text;
      });
    },
    ".departure-date-label": (dom: HTMLElement) => {
      departureDate.addEventListener("change", () => {
        const text = departureDate.value
          ? `Depart ${DAYS[new Date(departureDate.value).getDay()]}`
          : "Depart: ";
        dom.innerHTML = text;
      });
    },
  };

  getKeys(reactive).forEach((selector) => {
    const targets = Array.from(document.querySelectorAll(selector));
    targets.forEach((target) => {
      const handler = reactive[selector];
      handler(<HTMLElement>target);
    });
  });

  const markerId = new URLSearchParams(window.location.search).get("marker");
  if (!markerId) return;
  const markers = loadMarkers();
  const marker = markers.find((m) => m.id + "" === markerId);
  if (!marker) return;
  const target = document.getElementById("data") as HTMLTextAreaElement;
  target.value = marker.about || "";
  const title = document.getElementById("title") as HTMLTextAreaElement;
  title.value = marker.text;

  const optional = document.getElementById("is-optional") as HTMLInputElement;
  optional.checked = !!marker.optional;

  function createDateControl() {
    // convert date to yyyy-mm-dd format
    const formatDate = (date: Date) => {
      const yyyy = date.getFullYear().toString().padStart(4, "0");
      const mm = (date.getMonth() + 1).toString().padStart(2, "0");
      const dd = date.getDate().toString().padStart(2, "0");
      const hours = date.getHours().toString().padStart(2, "0");
      const minutes = date.getMinutes().toString().padStart(2, "0");
      return `${yyyy}-${mm}-${dd}T${hours}:${minutes}:00`;
    };

    if (marker?.arrivalDate && arrivalDate) {
      arrivalDate.value = marker?.arrivalDate;
      // trigger change event
      arrivalDate.dispatchEvent(new Event("change"));
    }
    if (marker?.departureDate && departureDate) {
      departureDate.value = marker?.departureDate;
      departureDate.dispatchEvent(new Event("change"));
    }

    isOvernight.checked = !!arrivalDate.value;

    on("is-overnight", () => {
      const isOvernightVisit = isOvernight.checked;
      if (arrivalDate) {
        arrivalDate.disabled = !isOvernightVisit;
        if (!isOvernightVisit) {
          arrivalDate.value = computeArrivalDate(markers, marker!.id);
          arrivalDate.dispatchEvent(new Event("change"));
        }
      }
      if (departureDate) {
        departureDate.disabled = !isOvernightVisit;
        if (!isOvernightVisit) {
          departureDate.value = "";
        } else {
          if (!departureDate.value && arrivalDate.value) {
            const d1 = new Date(arrivalDate.value);
            console.log(arrivalDate.value, d1, d1.toDateString());
            const d2 = new Date(d1.valueOf() + 86400000);
            console.log(d2, d2.toDateString());
            departureDate.value = formatDate(d2);
            departureDate.dispatchEvent(new Event("change"));
          }
        }
      }

      document.querySelectorAll(".for-overnight").forEach((el) => {
        el.classList.toggle("hidden", !isOvernightVisit);
      });
    });

    trigger("is-overnight");
  }

  applyTriggers();
  createDateControl();

  on("save", () => {
    marker.optional = optional.checked;
    marker.text = title.value;
    marker.about = target.value;
    if (arrivalDate?.value) {
      marker.arrivalDate = arrivalDate.value;
    } else {
      marker.arrivalDate = "";
    }

    if (departureDate?.value) {
      marker.departureDate = departureDate.value;
    } else {
      marker.departureDate = "";
    }

    saveMarkers(markers);
    trigger("back");
  });

  on("back", () => {
    window.location.href = "../index.html";
  });

  on("geolocate", async () => {
    const location = title.value;
    const bias = marker.center;
    const rawResult = await GoogleApi.geocode(location, {
      lng: bias.lng,
      lat: bias.lat,
    });
    const result = GoogleApi.normalize(rawResult);
    const f = getClosestFeature(result, bias);
    if (!f) return;
    marker.text = f.text;
    marker.center = f.center;
    saveMarkers(markers);
    window.location.href = `../index.html?center={"lng":${marker.center.lng},"lat":${marker.center.lat}}`;
  });
}

function getKeys<T>(reactive: T) {
  return Object.keys(reactive) as Array<keyof T>;
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

const ICON_SCALE = 1.6;

const globals = {
  geoapify: {
    about: "geoapify key",
    key: "",
  },
  googleapi: {
    about: "google api key",
    key: "",
  },
};

function promptForKey(key: keyof typeof globals) {
  const value = prompt(
    `Enter value for ${globals[key].about}`,
    globals[key].key
  );
  if (!value) return "";
  globals[key].key = value;
  return value;
}

function promptForKeys() {
  const keys = getKeys(globals);
  keys.forEach((k) => {
    let value = localStorage.getItem(k) as string;
    if (!value) {
      value = promptForKey(k);
      if (value) localStorage.setItem(k, value);
    }
    globals[k].key = value;
  });
}

class Geoapify {
  static async geocode(search: string, near: { lng: number; lat: number }) {
    const response = await fetch(
      `https://api.geoapify.com/v1/geocode/search?text=${search}&bias=proximity:${near.lng},${near.lat}&apiKey=${globals.geoapify.key}`
    );
    const data = (await response.json()) as GeoapifyGeocodeReponse;
    return data;
  }

  static normalize(data: GeoapifyGeocodeReponse): Array<GeocodeResult> {
    return data.features.map((f) => ({
      text: f.properties.name || "unknown",
      center: {
        lng: f.geometry.coordinates[0],
        lat: f.geometry.coordinates[1],
      },
    }));
  }

  static getFeatureText(result: GeoapifyGeocodeResultFeature): string {
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
          case "postcode":
            break;
          default:
            console.log(
              `unknown result_type: ${result.properties.result_type}`
            );
        }
        break;
      default:
        console.log(`unknown type: ${result.type}`);
        break;
    }
    return text;
  }
}

class GoogleApi {
  static async geocode(search: string, near: Leaflet.LatLngLiteral) {
    // url encode the search term
    const encodedSearch = encodeURIComponent(search);
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedSearch}&bounds=${near.lat},${near.lng}%7C,${near.lat},${near.lng}&key=${globals.googleapi.key}`
    );
    const data = (await response.json()) as GoogleGeocoderResponse;
    return data;
  }

  static normalize(response: GoogleGeocoderResponse): Array<GeocodeResult> {
    return response.results.map((r) => ({
      text: r.formatted_address,
      center: {
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
      },
    }));
  }
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
    } else if (e.classList.contains("as-change")) {
      e.addEventListener("change", (e) => {
        trigger(eventName, e);
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

function computeArrivalDate(markers: MarkerInfo[], id: number): string {
  let result = "";
  markers.some((m) => {
    if (m.departureDate) result = m.departureDate;
    return m.id === id;
  });
  return result;
}

interface IAction {
  name: string;
  execute: (state: IActionState) => void;
}

interface IActionState {
  mapMarker: Leaflet.Marker;
  marker: MarkerInfo;
  markers: Array<MarkerInfo>;
}

class GotoNextMarkerAction {
  name = "Next Stop";
  execute(actionState: IActionState) {
    const { marker, markers } = actionState;
    const index = markers.indexOf(marker);
    const next = markers[index + 1];
    if (!next) return;
    trigger("popup", { marker: next });
  }
}

class GotoPriorMarkerAction {
  name = "Previous Stop";
  execute(actionState: IActionState) {
    const { marker, markers } = actionState;
    const index = markers.indexOf(marker);
    if (index <= 0) return;
    const next = markers[index - 1];
    trigger("popup", { marker: next });
  }
}

function injectAction(state: IActionState, action: IAction) {
  const { mapMarker } = state;
  mapMarker.on("popupopen", async () => {
    await sleep(0);
    const dom = mapMarker.getPopup()!.getContent() as HTMLElement;
    const button = document.createElement("button");
    button.type = "button";
    //button.classList.add("col1-2");
    button.innerHTML = action.name;
    button.addEventListener("click", () => action.execute(state));
    dom.appendChild(button);
  });
}

async function sleep(ticks: number) {
  return new Promise((resolve) => setTimeout(resolve, ticks));
}

function getClosestFeature(
  result: Array<GeocodeResult>,
  bias: Leaflet.LatLngLiteral
) {
  let distance = Infinity;
  let closestFeature: GeocodeResult | undefined;
  result.forEach((feature) => {
    const d = distanceTo(bias, feature.center);
    if (d < distance) {
      closestFeature = feature;
      distance = d;
    }
  });
  return closestFeature;
}

function distanceTo(p1: Leaflet.LatLngLiteral, p2: Leaflet.LatLngLiteral) {
  const dx = p2.lng - p1.lng;
  const dy = p2.lat - p1.lat;
  return Math.sqrt(dx * dx + dy * dy);
}
function epochDays(date: Date) {
  // timezone offset
  const ticksPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((date.valueOf() - date.getTimezoneOffset() * 60 * 1000) / ticksPerDay);
}
