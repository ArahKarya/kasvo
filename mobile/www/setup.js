// First screen of the app: remember which Kasvo server to open, check it answers, then go there.
// Opening this page with ?setup=1 (the "Change server" link in Kasvo's More page) shows the form again.
(function () {
  "use strict";

  var KEY = "kasvo.server";
  var TEXT = {
    id: {
      title: "Hubungkan ke server Kasvo",
      intro: "Kasvo berjalan di server Anda sendiri. Isi alamatnya, misalnya IP laptop di Wi-Fi yang sama atau domain Kasvo Anda.",
      label: "Alamat server",
      hint: "Contoh: 192.168.1.10:3100 atau kasvo.contoh.id",
      connect: "Hubungkan",
      connecting: "Menghubungkan ke",
      empty: "Isi alamat server dulu.",
      unreachable: "Server tidak bisa dihubungi. Pastikan HP dan server di jaringan yang sama dan Kasvo sedang berjalan.",
      notKasvo: "Alamat itu bukan server Kasvo.",
    },
    en: {
      title: "Connect to your Kasvo server",
      intro: "Kasvo runs on your own server. Enter its address, such as your laptop's IP on the same Wi-Fi or your Kasvo domain.",
      label: "Server address",
      hint: "For example: 192.168.1.10:3100 or kasvo.example.com",
      connect: "Connect",
      connecting: "Connecting to",
      empty: "Enter the server address first.",
      unreachable: "Can't reach the server. Check that the phone and server are on the same network and Kasvo is running.",
      notKasvo: "That address is not a Kasvo server.",
    },
  };
  var t = TEXT[(navigator.language || "id").slice(0, 2) === "en" ? "en" : "id"];
  document.documentElement.lang = t === TEXT.en ? "en" : "id";
  document.querySelectorAll("[data-t]").forEach(function (el) { el.textContent = t[el.getAttribute("data-t")]; });

  var form = document.getElementById("setup");
  var input = document.getElementById("url");
  var error = document.getElementById("error");
  var button = form.querySelector("button");
  var connecting = document.getElementById("connecting");

  function store(action, value) {
    try {
      if (action === "get") return localStorage.getItem(KEY);
      localStorage.setItem(KEY, value);
    } catch (e) { return null; }
    return null;
  }

  /** "192.168.1.10:3100" → http://…, "kasvo.example.com" → https://…; no trailing slash. */
  function normalize(raw) {
    var value = raw.trim().replace(/\/+$/, "");
    if (!value) return "";
    if (!/^https?:\/\//i.test(value)) {
      var local = /^(localhost|\d{1,3}(\.\d{1,3}){3}|[^.\/]+\.local)(:\d+)?(\/|$)/i.test(value);
      value = (local ? "http://" : "https://") + value;
    }
    return value;
  }

  function check(base) {
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, 7000);
    return fetch(base + "/api/health", { cache: "no-store", signal: controller.signal })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) { return body && body.app === "kasvo" ? "ok" : "notKasvo"; })
      .catch(function () { return "unreachable"; })
      .finally(function () { clearTimeout(timer); });
  }

  function open(base) { location.replace(base + "/dashboard"); }

  function showForm(prefill, message) {
    connecting.hidden = true;
    form.hidden = false;
    input.value = prefill || "";
    error.textContent = message || "";
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var base = normalize(input.value);
    if (!base) { error.textContent = t.empty; return; }
    button.disabled = true;
    error.textContent = "";
    check(base).then(function (result) {
      button.disabled = false;
      if (result !== "ok") { error.textContent = t[result]; return; }
      store("set", base);
      open(base);
    });
  });

  var saved = store("get");
  if (saved && !/[?&]setup=1/.test(location.search)) {
    connecting.hidden = false;
    document.getElementById("connecting-url").textContent = saved;
    check(saved).then(function (result) { if (result === "ok") open(saved); else showForm(saved, t[result]); });
  } else {
    showForm(saved, "");
  }
})();
