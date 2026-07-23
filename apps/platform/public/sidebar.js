var match = decodeURIComponent(document.cookie)
  .split(";")
  .find(function (s) {
    return s.trimStart().startsWith("--sidebar-width=");
  });

if (match) {
  var sidebarWidth = parseInt(match.split("=")[1] || "", 10);
  if (!isNaN(sidebarWidth)) {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      sidebarWidth + "px",
    );
  }
}
