const menuToggle = document.getElementById("menuToggle");
const mainNav = document.getElementById("mainNav");

menuToggle?.addEventListener("click", () => {
  const isOpen = mainNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

document.querySelectorAll(".nav a").forEach((link) => {
  link.addEventListener("click", () => {
    mainNav.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
});

const form = document.getElementById("rideForm");
const note = document.getElementById("formNote");

form?.addEventListener("submit", (event) => {
  event.preventDefault();

  const data = new FormData(form);
  const message = [
    "New ride request from M Express Transportation website",
    "",
    `Full Name: ${data.get("name")}`,
    `Phone: ${data.get("phone")}`,
    `Pick-Up Address: ${data.get("pickup")}`,
    `Drop-Off Address: ${data.get("dropoff")}`,
    `Date: ${data.get("date")}`,
    `Time: ${data.get("time")}`,
    `Mobility Type: ${data.get("mobility")}`,
    `Additional Details: ${data.get("details") || "N/A"}`
  ].join("\n");

  const subject = encodeURIComponent("New Ride Request");
  const body = encodeURIComponent(message);

  window.location.href = `mailto:info@mexpress-mass.com?subject=${subject}&body=${body}`;
  note.textContent = "Your email app should open with the ride request details.";
});
