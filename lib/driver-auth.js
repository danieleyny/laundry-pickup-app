// Driver PINs map to areas. Change PINs here if drivers rotate.
const DRIVER_AREA_MAP = {
  "1234": "downtown",
  "4321": "uptown",
};

function getAreaForPin(pin) {
  return DRIVER_AREA_MAP[String(pin || "").trim()] || null;
}

export { DRIVER_AREA_MAP, getAreaForPin };
