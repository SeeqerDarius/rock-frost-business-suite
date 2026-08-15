/* global window, document */
(function () {
  var startupTimeout;

  window.__ROCK_FROST_MARK_READY__ = function () {
    var root = document.getElementById("root");
    if (root) root.dataset.appReady = "true";
    if (startupTimeout) window.clearTimeout(startupTimeout);
  };

  function showStartupError(message) {
    var root = document.getElementById("root");
    if (!root || root.dataset.appReady === "true" || !root.querySelector("#startup-status")) return;
    root.innerHTML =
      '<main style="display:grid;min-height:100vh;place-items:center;padding:32px;font-family:Segoe UI,sans-serif;background:#f8fafc;color:#0f172a">' +
      '<section style="max-width:560px;border:1px solid #cbd5e1;border-radius:16px;background:white;padding:28px">' +
      '<h1 style="margin:0 0 12px;font-size:24px">Rock Frost could not start</h1>' +
      '<p style="line-height:1.6;color:#475569">' + message + '</p>' +
      '<p style="line-height:1.6;color:#475569">Close the application and contact Rock Frost support with this message.</p>' +
      '</section></main>';
  }

  window.addEventListener("error", function (event) {
    showStartupError(event.message || "A startup script failed to load.");
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    showStartupError(reason && reason.message ? reason.message : "A startup task failed.");
  });
  startupTimeout = window.setTimeout(function () {
    var root = document.getElementById("root");
    if (root && root.dataset.appReady !== "true" && root.querySelector("#startup-status")) {
      showStartupError("The application interface did not finish loading.");
    }
  }, 8000);
})();
