const menu = document.getElementById("menu");
const nav = document.getElementById("nav");
menu?.addEventListener("click", () => nav.classList.toggle("open"));

document.querySelectorAll(".nav a").forEach(link => {
  link.addEventListener("click", () => nav.classList.remove("open"));
});

const form = document.getElementById("rideForm");
const note = document.getElementById("note");

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const message = [
    "New ride request from M Express Transportation website",
    "",
    `Full Name: ${data.get("name")}`,
    `Phone: ${data.get("phone")}`,
    `Pickup Address: ${data.get("pickup")}`,
    `Drop-off Address: ${data.get("dropoff")}`,
    `Date: ${data.get("date")}`,
    `Time: ${data.get("time")}`,
    `Mobility Type: ${data.get("mobility")}`,
    `Details: ${data.get("details") || "N/A"}`
  ].join("\n");

  window.location.href = `mailto:info@mexpress-mass.com?subject=${encodeURIComponent("New Ride Request")}&body=${encodeURIComponent(message)}`;
  note.textContent = "Your email app should open with the ride request details.";
});
