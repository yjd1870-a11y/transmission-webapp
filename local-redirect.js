(() => {
  if (window.location.protocol !== "file:") return;
  window.location.replace("http://127.0.0.1:8000/");
})();
