import { waterTemperature, mixingFriction } from "./math.mjs";
const $ = (id) => document.getElementById(id);
const number = (id) => ($(id).value === "" ? NaN : Number($(id).value));
function inputs() {
  return {
    room: number("tempRoom"),
    flour: number("tempFlour"),
    starter: $("tempHasStarter").checked ? number("tempStarter") : null,
  };
}
function update() {
  $("tempStarterLabel").hidden = !$("tempHasStarter").checked;
  try {
    const t = waterTemperature({
      ...inputs(),
      target: number("tempTarget"),
      friction: number("tempFriction"),
    });
    $("temperatureResult").textContent =
      `Estimated water temperature: ${t.toFixed(1)} °C`;
    $("temperatureNote").textContent =
      t < 0 || t > 50
        ? "This estimate is outside 0–50 °C. Check your measurements and mixing factor; adjust ingredient temperatures before mixing."
        : "Check the dough temperature after mixing. This is an estimate, not a fermentation timer.";
  } catch {
    $("temperatureResult").textContent =
      "Enter your measurements to estimate the water temperature.";
    $("temperatureNote").textContent =
      "Use your own mixing factor. You can calculate it from a previous mix below.";
  }
  try {
    const f = mixingFriction({
      ...inputs(),
      actual: number("tempActual"),
      water: number("tempWater"),
    });
    $("frictionResult").textContent =
      `Mixing factor from this batch: ${f.toFixed(1)} °C`;
    $("useFriction").disabled = false;
  } catch {
    $("frictionResult").textContent =
      "Enter the water and final dough temperatures from a completed mix, with its room, flour and starter measurements above.";
    $("useFriction").disabled = true;
  }
}
$("temperatureTool").addEventListener("input", update);
$("useFriction").addEventListener("click", () => {
  $("tempFriction").value = mixingFriction({
    ...inputs(),
    actual: number("tempActual"),
    water: number("tempWater"),
  });
  update();
});
update();
