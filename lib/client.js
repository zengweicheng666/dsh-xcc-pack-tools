/**
 * dsh-xcc-pack-tools client half: registers the 'pack' sidebar tab into
 * dsh-better-sidebar (ctx.betterSidebar.registerTab) and renders the XCC
 * pack/build/release panel — UE packaging via package.ps1, Web UI builds
 * via copy-dist-dev/prod.ps1, and release naming/zipping as
 * XCC-Deluxe-{yyyyMMdd}(-N) — talking to the fenced /pack/api/* routes
 * served by this package's host half.
 *
 * Bundle format: window.__ModuleLoader__.load({id, factory}), CJS factory.
 * Only shell-seeded modules are required (react). No build step needed.
 */
window.__ModuleLoader__.load({
  id: "dsh-xcc-pack-tools",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useRef = React.useRef;
    var useCallback = React.useCallback;

    function h(type, props) {
      var children = Array.prototype.slice.call(arguments, 2);
      return React.createElement.apply(React, [type, props].concat(children));
    }

    // ------------------------------------------------------------ styles
    var STYLE_ID = "dsh-xcc-pack-tools-style";
    var CSS = [
      ".dsh-pack{display:flex;flex-direction:column;height:100%;min-width:0;font:12px/1.5 system-ui,sans-serif;color:#c9d1d9;background:transparent}",
      ".dsh-pack *{box-sizing:border-box}",
      ".dsh-pack-header{padding:8px 10px;border-bottom:1px solid rgba(148,163,184,.15);display:flex;align-items:center;gap:8px;min-width:0}",
      ".dsh-pack-proj{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;color:#8b949e}",
      ".dsh-pack-ue{flex-shrink:0;font-size:10px;color:#d2a8ff;background:rgba(210,168,255,.12);border-radius:4px;padding:1px 6px;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-pack-toolbar{padding:6px 10px;display:flex;align-items:center;gap:6px;border-bottom:1px solid rgba(148,163,184,.12)}",
      ".dsh-pack-seg{display:flex;gap:2px;flex:1;min-width:0}",
      ".dsh-pack-tabbtn{border:1px solid transparent;background:transparent;color:#8b949e;font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer}",
      ".dsh-pack-tabbtn:hover{color:#c9d1d9;background:rgba(148,163,184,.1)}",
      ".dsh-pack-tabbtn.on{color:#e6edf3;background:rgba(88,166,255,.15);border-color:rgba(88,166,255,.3)}",
      ".dsh-pack-actbtn{border:1px solid rgba(148,163,184,.3);background:rgba(148,163,184,.08);color:#c9d1d9;font-size:11px;padding:3px 10px;border-radius:6px;cursor:pointer;flex-shrink:0}",
      ".dsh-pack-actbtn:hover{background:rgba(148,163,184,.18)}",
      ".dsh-pack-actbtn:disabled{opacity:.5;cursor:default}",
      ".dsh-pack-actbtn.primary{background:rgba(46,160,67,.25);border-color:rgba(46,160,67,.5);color:#7ee787}",
      ".dsh-pack-actbtn.danger{background:rgba(248,81,73,.15);border-color:rgba(248,81,73,.45);color:#ffa198}",
      ".dsh-pack-mini{border:1px solid rgba(148,163,184,.3);background:transparent;color:#8b949e;font-size:10px;padding:1px 7px;border-radius:4px;cursor:pointer;flex-shrink:0}",
      ".dsh-pack-mini:hover{color:#c9d1d9}",
      ".dsh-pack-mini.ok:hover{color:#7ee787;border-color:rgba(46,160,67,.5)}",
      ".dsh-pack-mini:disabled{opacity:.4;cursor:default}",
      ".dsh-pack-body{flex:1;min-height:0;overflow:auto;padding:8px 10px 10px}",
      ".dsh-pack-card{border:1px solid rgba(148,163,184,.18);border-radius:8px;padding:10px;margin-bottom:10px;background:rgba(148,163,184,.04)}",
      ".dsh-pack-card h4{margin:0 0 8px;font-size:12px;color:#e6edf3;display:flex;align-items:center;gap:6px}",
      ".dsh-pack-row{display:flex;align-items:center;gap:8px;margin:5px 0;min-width:0}",
      ".dsh-pack-lbl{flex:0 0 auto;font-size:11px;color:#8b949e;width:88px}",
      ".dsh-pack-input{flex:1;min-width:0;background:#0d1117;color:#e6edf3;border:1px solid rgba(148,163,184,.25);border-radius:6px;padding:4px 8px;font:12px/1.5 system-ui,sans-serif}",
      ".dsh-pack-input:focus{outline:none;border-color:#58a6ff}",
      ".dsh-pack-select{flex:1;min-width:0;background:#0d1117;color:#e6edf3;border:1px solid rgba(148,163,184,.25);border-radius:6px;padding:4px 6px;font:12px/1.5 system-ui,sans-serif}",
      ".dsh-pack-check{display:flex;align-items:center;gap:6px;margin:5px 0;font-size:12px;color:#c9d1d9;cursor:pointer;min-width:0}",
      ".dsh-pack-check input{accent-color:#58a6ff;flex-shrink:0}",
      ".dsh-pack-warn{font-size:11px;color:#f0883e;background:rgba(240,136,62,.1);border:1px solid rgba(240,136,62,.35);border-radius:6px;padding:6px 8px;margin:6px 0;line-height:1.5}",
      ".dsh-pack-note{font-size:11px;color:#8b949e;margin:6px 0;line-height:1.5}",
      ".dsh-pack-err{font-size:11px;color:#ffa198;background:rgba(248,81,73,.1);border:1px solid rgba(248,81,73,.35);border-radius:6px;padding:6px 8px;margin:6px 0;line-height:1.5;white-space:pre-wrap;word-break:break-all}",
      ".dsh-pack-name{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#7ee787;background:rgba(46,160,67,.1);border:1px solid rgba(46,160,67,.35);border-radius:6px;padding:5px 8px;margin:6px 0;word-break:break-all}",
      ".dsh-pack-name.collide{color:#ffa198;border-color:rgba(248,81,73,.5);background:rgba(248,81,73,.08)}",
      ".dsh-pack-log{flex:1;min-height:0;overflow:auto;background:#0d1117;border:1px solid rgba(148,163,184,.2);border-radius:6px;margin-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.55;padding:6px 8px;white-space:pre-wrap;word-break:break-all;color:#c9d1d9}",
      ".dsh-pack-loghead{display:flex;align-items:center;gap:8px;font-size:11px;color:#8b949e;margin-top:8px}",
      ".dsh-pack-spin{width:10px;height:10px;border:2px solid rgba(148,163,184,.25);border-top-color:#58a6ff;border-radius:50%;animation:dsh-pack-spin .8s linear infinite;flex-shrink:0}",
      "@keyframes dsh-pack-spin{to{transform:rotate(360deg)}}",
      ".dsh-pack-statusbar{padding:4px 10px;border-top:1px solid rgba(148,163,184,.12);font-size:11px;color:#8b949e;min-height:24px;display:flex;align-items:center;gap:6px}",
      ".dsh-pack-statusbar.err{color:#ffa198}",
      ".dsh-pack-statusbar.ok{color:#7ee787}",
      ".dsh-pack-rellist{margin-top:6px}",
      ".dsh-pack-relrow{display:flex;align-items:center;gap:8px;padding:3px 2px;border-bottom:1px solid rgba(148,163,184,.08);font-size:11px;min-width:0}",
      ".dsh-pack-relname{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#c9d1d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dsh-pack-relmeta{flex:1;min-width:0;text-align:right;color:#8b949e;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      ".dsh-pack-empty{padding:16px 8px;text-align:center;color:#6e7681;font-size:12px}",
      ".dsh-pack-kv{display:flex;gap:6px;font-size:11px;color:#8b949e;margin:3px 0;min-width:0}",
      ".dsh-pack-kv b{color:#c9d1d9;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
      ".dsh-pack-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;text-align:left}"
    ].join("\n");

    function ensureStyle() {
      if (document.getElementById(STYLE_ID)) return;
      var el = document.createElement("style");
      el.id = STYLE_ID;
      el.textContent = CSS;
      document.head.appendChild(el);
    }

    function removeStyle() {
      var el = document.getElementById(STYLE_ID);
      if (el) el.remove();
    }

    // --------------------------------------------------------------- api
    function post(method, body) {
      return fetch("/pack/api/" + method, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {}),
      })
        .then(function (r) {
          return r.json().catch(function () { return null; });
        })
        .then(function (j) {
          if (!j || j.ok !== true) {
            var err = new Error((j && j.error && j.error.message) || "请求失败");
            err.code = (j && j.error && j.error.code) || "error";
            throw err;
          }
          return j.value;
        });
    }

    function fmtSize(n) {
      if (n === undefined || n === null) return "";
      if (n >= 1073741824) return (n / 1073741824).toFixed(2) + " GB";
      if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
      if (n >= 1024) return (n / 1024).toFixed(0) + " KB";
      return n + " B";
    }

    function fmtTime(ms) {
      var s = Math.max(0, Math.floor((ms || 0) / 1000));
      var m = Math.floor(s / 60);
      s = s % 60;
      var h = Math.floor(m / 60);
      m = m % 60;
      var pad = function (x) { return String(x).padStart(2, "0"); };
      return h > 0 ? h + ":" + pad(m) + ":" + pad(s) : m + ":" + pad(s);
    }

    function fmtDate(iso) {
      if (!iso) return "";
      try {
        var d = new Date(iso);
        var pad = function (x) { return String(x).padStart(2, "0"); };
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
      } catch (e) { return iso; }
    }

    // -------------------------------------------------------------- icons
    function packIcon(size) {
      return h("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M21 8.5v7a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 15.5v-7a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4a2 2 0 0 1 1 1.73z" }),
        h("path", { d: "M3.3 7.7 12 12.5l8.7-4.8" }),
        h("path", { d: "M12 22V12" }));
    }

    // ------------------------------------------------------------- panel
    var LS_KEY = "dsh-xcc-pack-tools:overrides";

    function loadOverrides() {
      try {
        var raw = window.localStorage.getItem(LS_KEY);
        if (raw) {
          var o = JSON.parse(raw);
          return { projectRoot: o.projectRoot || "", ue5Dir: o.ue5Dir || "" };
        }
      } catch (e) { /* ignore */ }
      return { projectRoot: "", ue5Dir: "" };
    }

    function PackPanel(props) {
      var scope = props.scope || {};
      var sessionId = scope.sessionId;
      var overrides = useRef(loadOverrides());

      var [root, setRoot] = useState(null);
      var [rootErr, setRootErr] = useState("");
      var [view, setView] = useState("pack");
      var [job, setJob] = useState(null);        // { jobId, kind, state }
      var [notice, setNotice] = useState("");
      var [err, setErr] = useState("");

      var [packOpts, setPackOpts] = useState({ buildConfig: "Development", skipCompile: false, skipWebBuild: true, cleanCook: false, closeEditor: false });
      var [webOpts, setWebOpts] = useState({ mode: "dev", targetDir: "" });
      var [manualNumber, setManualNumber] = useState("");
      var [preview, setPreview] = useState(null); // nextName result
      var [previewErr, setPreviewErr] = useState("");
      var [releasing, setReleasing] = useState(false);
      var [runBusy, setRunBusy] = useState(false);
      // upload view state
      var [bdpan, setBdpan] = useState(null);       // bdpanStatus result
      var [authUrl, setAuthUrl] = useState("");
      var [authCode, setAuthCode] = useState("");
      var [authBusy, setAuthBusy] = useState(false);
      var [localPath, setLocalPath] = useState(""); // empty = auto latest zip
      var [remoteDir, setRemoteDir] = useState(""); // empty = settings default

      var logRef = useRef(null);
      var timerRef = useRef(null);

      var base = { sessionId: sessionId };
      if (scope.cwd) base.cwd = scope.cwd;
      if (overrides.current.projectRoot) base.projectRoot = overrides.current.projectRoot;
      if (overrides.current.ue5Dir) base.ue5Dir = overrides.current.ue5Dir;

      var reload = useCallback(function () {
        post("root", base)
          .then(function (v) {
            setRoot(v);
            setRootErr("");
            var releases = v.releases || [];
            var date = v.now;
            return post("nextName", Object.assign({}, base, { date: date })).then(function (nv) {
              setPreview(nv);
              setPreviewErr("");
              return releases;
            }).catch(function (e) {
              setPreview(null);
              setPreviewErr(e.message);
              return releases;
            });
          })
          .then(function () { /* releases folded into root */ })
          .catch(function (e) {
            setRoot(null);
            setRootErr(e.message);
          });
      }, [sessionId, base.projectRoot, base.ue5Dir]);

      useEffect(function () { reload(); }, [reload]);

      // refresh bdpan auth status whenever the upload view is opened
      useEffect(function () {
        if (view === "upload") loadBdpanStatus();
      }, [view]);

      var failRef = useRef(0); // consecutive poll failures

      // poll the running job every 1.5s
      useEffect(function () {
        if (!job || !job.jobId) return;
        var pollMethod = job.kind === "pack" ? "packPoll"
          : job.kind === "webBuild" ? "webBuildPoll"
          : job.kind === "release" ? "releasePoll"
          : job.kind === "upload" ? "uploadPoll"
          : job.kind === "bdpanInstall" ? "bdpanInstallPoll"
          : "releasePoll";
        var tick = function () {
          post(pollMethod, { jobId: job.jobId })
            .then(function (st) {
              failRef.current = 0;
              setJob({ jobId: job.jobId, kind: job.kind, state: st });
              if (!st.running && st.done) {
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
                if (st.error && !st.killed) {
                  setErr(st.error);
                  setNotice("");
                } else if (st.killed) {
                  setNotice("任务已取消");
                  setErr("");
                } else {
                  setNotice("任务完成 ✔");
                  setErr("");
                }
                reload();
                if (job.kind === "bdpanInstall") loadBdpanStatus();
              }
            })
            .catch(function (e) {
              failRef.current += 1;
              if (failRef.current >= 3) {
                // keep the UI honest: stop polling, surface the failure
                if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
                setErr("轮询失败（连续 3 次）：" + e.message);
              }
            });
        };
        timerRef.current = setInterval(tick, 1500);
        return function () {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        };
      }, [job ? job.jobId : null, job ? job.kind : null]);

      // auto-scroll log panel
      useEffect(function () {
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
      }, [job && job.state ? job.state.lines : null]);

      // a job of this kind is considered running until its FIRST poll returns
      // (job.state === null means "started, not yet polled") — after that it
      // stays running only while job.state.running is true, so a finished job
      // releases the buttons and clears the "构建中/发布中" labels.
      function isJobRunning(kind) {
        return !!(job && job.kind === kind && (!job.state || job.state.running));
      }

      function startJob(kind, body, doneName) {
        setErr("");
        setNotice("");
        var method = kind === "pack" ? "packStart" : kind === "webBuild" ? "webBuildStart" : "releaseStart";
        post(method, Object.assign({}, base, body))
          .then(function (v) {
            if (kind === "release") setNotice("发布任务已启动：" + (v.name || ""));
            setJob({ jobId: v.jobId, kind: kind, state: null });
          })
          .catch(function (e) {
            setErr(e.message);
          });
      }

      function cancelJob() {
        if (!job || !job.jobId) return;
        post("kill", { jobId: job.jobId }).catch(function (e) { setErr("取消失败：" + e.message); });
      }

      function refreshPreview() {
        if (!root) return;
        post("nextName", Object.assign({}, base, {
          date: root.now,
          number: manualNumber.trim() === "" ? undefined : Number(manualNumber),
        }))
          .then(function (v) { setPreview(v); setPreviewErr(""); })
          .catch(function (e) { setPreview(null); setPreviewErr(e.message); });
      }

      // launch XCC.exe detached: target 'build' (Saved\Windows) or 'release' (a release folder)
      function runGame(target, name) {
        setErr("");
        setNotice("");
        setRunBusy(true);
        post("run", Object.assign({}, base, { target: target, name: name }))
          .then(function (v) { setNotice("已启动：" + v.exe); })
          .catch(function (e) { setErr(e.message); })
          .finally(function () { setRunBusy(false); });
      }

      // ------------------------------------------------ view: pack
      function PackView() {
        var busy = isJobRunning("pack");
        return h("div", {},
          h("div", { className: "dsh-pack-card" },
            h("h4", {}, "UE 打包（package.ps1）"),
            h("div", { className: "dsh-pack-kv" }, "输出目录：", h("b", { className: "dsh-pack-path", title: root ? root.outputDir : "" }, root ? root.outputDir : "—")),
            h("div", { className: "dsh-pack-kv" }, "UE 5.7：", h("b", { className: "dsh-pack-path", title: root ? (root.ueDir || "未找到") : "…" }, root ? (root.ueDir || "未找到") : "…")),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "UE 目录"),
              h("input", { className: "dsh-pack-input", placeholder: "留空自动探测（XCC_UE_DIR / 常见安装路径）", value: overrides.current.ue5Dir,
                onChange: function (e) {
                  overrides.current.ue5Dir = e.target.value;
                  try { window.localStorage.setItem(LS_KEY, JSON.stringify(overrides.current)); } catch (x) { /* ignore */ }
                } })),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "BuildConfig"),
              h("select", { className: "dsh-pack-select", value: packOpts.buildConfig,
                onChange: function (e) { setPackOpts(Object.assign({}, packOpts, { buildConfig: e.target.value })); } },
                h("option", { value: "Development" }, "Development"),
                h("option", { value: "Shipping" }, "Shipping"),
                h("option", { value: "Debug" }, "Debug"))),
            h("label", { className: "dsh-pack-check" }, h("input", { type: "checkbox", checked: packOpts.skipCompile, onChange: function (e) { setPackOpts(Object.assign({}, packOpts, { skipCompile: e.target.checked })); } }), "跳过 C++ 编译（仅 Web 变更时）"),
            h("label", { className: "dsh-pack-check" }, h("input", { type: "checkbox", checked: packOpts.skipWebBuild, onChange: function (e) { setPackOpts(Object.assign({}, packOpts, { skipWebBuild: e.target.checked })); } }), "跳过内部 Web 构建步骤"),
            h("label", { className: "dsh-pack-check" }, h("input", { type: "checkbox", checked: packOpts.cleanCook, onChange: function (e) { setPackOpts(Object.assign({}, packOpts, { cleanCook: e.target.checked })); } }), "清理 Cook 缓存（慢，缓存损坏时用）"),
            h("label", { className: "dsh-pack-check" }, h("input", { type: "checkbox", checked: packOpts.closeEditor, onChange: function (e) { setPackOpts(Object.assign({}, packOpts, { closeEditor: e.target.checked })); } }), "允许关闭运行中的 Unreal Editor"),
            packOpts.closeEditor ? h("div", { className: "dsh-pack-warn" }, "勾选后打包脚本会先关闭正在运行的 Unreal Editor（可能丢失未保存内容）。") : null,
            h("div", { className: "dsh-pack-note" }, "「跳过内部 Web 构建步骤」默认勾选：打包不再内联构建生产版 Web UI，避免覆盖仓库 HTML\\dist（Web 产物请用「Web 构建」页单独构建）；如需随包内联生产版 Web UI 可取消勾选。UAT 耗时约 1 小时级，日志实时流式显示。"),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn primary", disabled: busy || !root, onClick: function () {
                startJob("pack", {
                  skipCompile: packOpts.skipCompile, skipWebBuild: packOpts.skipWebBuild,
                  cleanCook: packOpts.cleanCook, closeEditor: packOpts.closeEditor,
                  buildConfig: packOpts.buildConfig,
                  ue5Dir: overrides.current.ue5Dir || undefined,
                });
              } }, busy ? "打包中…" : "开始打包"))),
          root && root.hasBuild ? null : h("div", { className: "dsh-pack-warn" }, "当前没有可用打包产物（Saved\\Windows\\XCC.exe 不存在），请先执行 UE 打包。"));
      }

      // ------------------------------------------------ view: web
      function WebView() {
        var busy = isJobRunning("webBuild");
        return h("div", {},
          h("div", { className: "dsh-pack-card" },
            h("h4", {}, "Web 构建（Vite）"),
            h("div", { className: "dsh-pack-kv" },
              "版本号：",
              h("b", {}, root && root.webVersion ? root.webVersion.current : "—"),
              root && root.webVersion ? h("span", {}, " → 构建后 " + root.webVersion.next) : null),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "模式"),
              h("select", { className: "dsh-pack-select", value: webOpts.mode,
                onChange: function (e) { setWebOpts(Object.assign({}, webOpts, { mode: e.target.value })); } },
                h("option", { value: "dev" }, "开发版 dev（默认）"),
                h("option", { value: "prod" }, "生产版 prod"))),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "目标目录"),
              h("input", { className: "dsh-pack-input", placeholder: "默认 ..\\HTML\\dist（相对 Web\\）", value: webOpts.targetDir,
                onChange: function (e) { setWebOpts(Object.assign({}, webOpts, { targetDir: e.target.value })); } })),
            h("div", { className: "dsh-pack-warn" }, "仓库 HTML\\dist 必须用开发版（dev）构建（AGENTS.md 规则）；生产版（prod）仅用于生产发布（WebSocket 实体刷卡、Toast 关闭）。构建会同时部署到 HTML\\dist 与 Saved\\Windows\\XCC\\HTML\\dist，并自增 Web\\version.json。"),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn primary", disabled: busy || !root, onClick: function () {
                startJob("webBuild", { mode: webOpts.mode, targetDir: webOpts.targetDir || undefined });
              } }, busy ? "构建中…" : "开始构建"))));
      }

      // --------------------------------------------- view: release
      function ReleaseView() {
        var busy = isJobRunning("release");
        var collide = preview && preview.collisions && preview.collisions.length > 0;
        var releases = root ? (root.releases || []) : [];
        return h("div", {},
          h("div", { className: "dsh-pack-card" },
            h("h4", {}, "发布命名 + 压缩"),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "来源"),
              h("b", { className: "dsh-pack-path", title: root ? root.outputDir : "" }, root ? root.outputDir : "—"),
              h("button", { className: "dsh-pack-mini ok", title: "启动 Saved\\Windows\\XCC.exe", disabled: !root || !root.hasBuild || runBusy,
                onClick: function () { runGame("build"); } }, "运行")),
            h("div", { className: "dsh-pack-kv" },
              "压缩工具：",
              h("b", { title: (root && root.sevenZip) || "" }, root && root.zipTool === "7z" ? "7-Zip" : ".NET ZipFile"),
              root && root.zipTool === "7z" && root.sevenZip ? h("span", {}, " · " + root.sevenZip) : null),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "编号（可选）"),
              h("input", { className: "dsh-pack-input", placeholder: "留空自动：当天首个无编号，之后 -1、-2…", value: manualNumber,
                onChange: function (e) { setManualNumber(e.target.value); } })),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn", disabled: !root || busy, onClick: refreshPreview }, "预览名称")),
            preview ? h("div", { className: "dsh-pack-name" + (collide ? " collide" : "") }, preview.name) : null,
            previewErr ? h("div", { className: "dsh-pack-err" }, previewErr) : null,
            collide ? h("div", { className: "dsh-pack-err" }, preview.collisions.join("；") + "。请更换编号或删除旧产物。") : null,
            h("div", { className: "dsh-pack-note" }, "流程：复制 Saved\\Windows 全部内容 → Saved\\" + (preview ? preview.name : "XCC-Deluxe-{日期}(-N)") + "\\，再压缩为同名 .zip（zip 内含同名顶层文件夹，与历史产物结构一致）。压缩工具优先 7-Zip（未安装时回退 .NET ZipFile）。复制 + 压缩约需 10-20 分钟（产物约 5GB）。"),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn primary", disabled: !root || busy || collide || (root && !root.hasBuild), onClick: function () {
                startJob("release", { number: manualNumber.trim() === "" ? undefined : Number(manualNumber), zip: true });
              } }, busy ? "发布中…" : "复制并压缩"),
              h("button", { className: "dsh-pack-actbtn", disabled: !root || busy || collide || (root && !root.hasBuild), onClick: function () {
                startJob("release", { number: manualNumber.trim() === "" ? undefined : Number(manualNumber), zip: false });
              } }, busy ? "发布中…" : "仅复制命名"))),
          h("div", { className: "dsh-pack-card" },
            h("h4", {}, "现有发布（Saved\\）"),
            releases.length === 0
              ? h("div", { className: "dsh-pack-empty" }, "暂无发布产物")
              : h("div", { className: "dsh-pack-rellist" },
                releases.map(function (r) {
                  return h("div", { className: "dsh-pack-relrow", key: r.path, title: r.path },
                    h("span", { className: "dsh-pack-relname" }, r.name + (r.isDir ? "\\" : ".zip")),
                    h("span", { className: "dsh-pack-relmeta" }, (r.isDir ? "" : fmtSize(r.size) + " · ") + fmtDate(r.mtime)),
                    r.isDir
                      ? h("button", { className: "dsh-pack-mini ok", title: "启动 " + r.name + "\\XCC.exe", disabled: runBusy,
                          onClick: function () { runGame("release", r.name); } }, "运行")
                      : null);
                }))));
      }

      // --------------------------------------------- view: upload
      function loadBdpanStatus() {
        post("bdpanStatus", {})
          .then(function (v) { setBdpan(v); })
          .catch(function (e) { setBdpan({ installed: false, loggedIn: false, error: e.message }); });
      }

      function installBdpan() {
        setErr("");
        setNotice("");
        post("bdpanInstallStart", {}).then(function (v) {
          setJob({ jobId: v.jobId, kind: "bdpanInstall", state: null });
        }).catch(function (e) { setErr(e.message); });
      }

      function getAuthUrl() {
        setErr("");
        setAuthUrl("");
        setAuthBusy(true);
        post("bdpanLoginUrl", {})
          .then(function (v) { setAuthUrl(v.url); })
          .catch(function (e) { setErr(e.message); })
          .finally(function () { setAuthBusy(false); });
      }

      function submitAuthCode() {
        setErr("");
        setNotice("");
        setAuthBusy(true);
        post("bdpanLogin", { code: authCode.trim() })
          .then(function (v) {
            setAuthCode("");
            setAuthUrl("");
            if (v.loggedIn) {
              setNotice("百度网盘登录成功 ✔");
              loadBdpanStatus();
            } else {
              setErr("登录未完成：" + (v.whoami || "请检查授权码"));
              loadBdpanStatus();
            }
          })
          .catch(function (e) { setErr(e.message); })
          .finally(function () { setAuthBusy(false); });
      }

      function logoutBdpan() {
        setErr("");
        post("bdpanLogout", {})
          .then(function () { setNotice("已退出百度网盘登录"); loadBdpanStatus(); })
          .catch(function (e) { setErr(e.message); });
      }

      function saveRemoteDirSetting(value) {
        setErr("");
        setNotice("");
        post("settingsSet", { bdpanRemoteDir: String(value || "").trim() })
          .then(function () { setNotice("默认上传目录已保存 ✔"); reload(); })
          .catch(function (e) { setErr(e.message); });
      }

      function UploadView() {
        var busy = isJobRunning("upload") || isJobRunning("bdpanInstall");
        var latestZip = root ? (root.latestZip || null) : null;
        var filePath = localPath.trim() || (latestZip ? latestZip.path : "");
        var remoteDirVal = remoteDir.trim() || (root && root.settings && root.settings.bdpanRemoteDir ? root.settings.bdpanRemoteDir.trim() : "") || "XCC-Deluxe/";
        var zipName = filePath ? filePath.replace(/\\/g, "/").split("/").pop() : "";
        var remotePreview = zipName ? remoteDirVal.replace(/\/+$/, "") + "/" + zipName : "—";

        var authCard;
        if (!bdpan) {
          authCard = h("div", { className: "dsh-pack-card" }, h("h4", {}, "百度网盘授权"), h("div", { className: "dsh-pack-note" }, "检测中…"));
        } else if (bdpan.error) {
          authCard = h("div", { className: "dsh-pack-card" },
            h("h4", {}, "百度网盘授权"),
            h("div", { className: "dsh-pack-err" }, "状态检测失败：" + bdpan.error),
            h("div", { className: "dsh-pack-row" }, h("button", { className: "dsh-pack-actbtn", onClick: loadBdpanStatus }, "重新检测")));
        } else if (!bdpan.installed) {
          authCard = h("div", { className: "dsh-pack-card" },
            h("h4", {}, "百度网盘授权"),
            h("div", { className: "dsh-pack-warn" }, "未检测到 bdpan CLI。点击安装（需要 Git Bash，来自 baidu-drive skill 的 install.sh，从百度 CDN 下载并校验 SHA256）。"),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn primary", disabled: busy, onClick: installBdpan }, busy ? "安装中…" : "安装 bdpan CLI"),
              h("button", { className: "dsh-pack-actbtn", onClick: loadBdpanStatus }, "重新检测")));
        } else if (!bdpan.loggedIn) {
          authCard = h("div", { className: "dsh-pack-card" },
            h("h4", {}, "百度网盘授权"),
            h("div", { className: "dsh-pack-kv" }, "CLI：", h("b", { className: "dsh-pack-path", title: bdpan.binPath }, bdpan.binPath || "—")),
            h("div", { className: "dsh-pack-note" }, "未登录。点击「获取授权链接」→ 浏览器打开并授权 → 复制 32 位授权码 → 粘贴后点「完成登录」（授权链接 10 分钟内有效）。"),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn primary", disabled: authBusy, onClick: getAuthUrl }, authBusy ? "获取中…" : "获取授权链接")),
            authUrl ? h("div", { className: "dsh-pack-name" }, h("a", { href: authUrl, target: "_blank", rel: "noreferrer" }, "点击此处打开授权页面")) : null,
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "授权码"),
              h("input", { className: "dsh-pack-input", placeholder: "32 位十六进制授权码", value: authCode, maxLength: 32,
                onChange: function (e) { setAuthCode(e.target.value); } })),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn primary", disabled: authBusy || authCode.trim().length !== 32, onClick: submitAuthCode }, "完成登录")));
        } else {
          authCard = h("div", { className: "dsh-pack-card" },
            h("h4", {}, "百度网盘授权"),
            h("div", { className: "dsh-pack-kv" }, "状态：", h("b", { style: { color: "#7ee787" } }, "已登录 ✔")),
            bdpan.whoami ? h("div", { className: "dsh-pack-kv" }, "账号：", h("b", {}, bdpan.whoami.split("\n")[0])) : null,
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "默认上传目录"),
              h("input", { className: "dsh-pack-input", placeholder: "相对 /apps/bdpan/，如 XCC-Deluxe/", value: remoteDirVal,
                onChange: function (e) { setRemoteDir(e.target.value); } }),
              h("button", { className: "dsh-pack-actbtn", onClick: function () { saveRemoteDirSetting(remoteDirVal); } }, "保存")),
            h("div", { className: "dsh-pack-note" }, "默认上传目录保存在插件设置中（~/.dsh/dsh-xcc-pack-tools-settings.json），上传页自动预填。"),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn", onClick: logoutBdpan }, "退出登录")));
        }

        return h("div", {},
          authCard,
          h("div", { className: "dsh-pack-card" },
            h("h4", {}, "上传发布包到百度网盘"),
            h("div", { className: "dsh-pack-kv" },
              "自动匹配：",
              h("b", {}, latestZip ? latestZip.name + ".zip" : "无发布 zip"),
              latestZip ? h("span", {}, " · " + fmtSize(latestZip.size) + " · " + fmtDate(latestZip.mtime)) : null),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "本地文件"),
              h("input", { className: "dsh-pack-input", placeholder: latestZip ? "留空 = 最新发布 " + latestZip.name + ".zip" : "选择要上传的文件", value: localPath,
                onChange: function (e) { setLocalPath(e.target.value); } })),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "网盘目录"),
              h("input", { className: "dsh-pack-input", placeholder: "相对 /apps/bdpan/，如 XCC-Deluxe/", value: remoteDirVal,
                onChange: function (e) { setRemoteDir(e.target.value); } })),
            h("div", { className: "dsh-pack-kv" }, "上传到：", h("b", {}, "/apps/" + remotePreview)),
            h("div", { className: "dsh-pack-note" }, "上传为后台任务，日志实时流式显示（大文件可能耗时较长）；单文件上传目标必须是完整文件路径，插件自动拼上文件名。"),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn primary", disabled: busy || !bdpan || !bdpan.loggedIn || !filePath,
                onClick: function () {
                  startJob("upload", { localPath: localPath.trim() || undefined, remoteDir: remoteDirVal });
                } }, busy ? "上传中…" : "开始上传"))));
      }

      // ------------------------------------------------------------- body
      var body;
      if (view === "web") body = h(WebView, {});
      else if (view === "release") body = h(ReleaseView, {});
      else if (view === "upload") body = h(UploadView, {});
      else body = h(PackView, {});

      var stageLabel = job && job.state ? (
        job.state.stage === "copying" ? "复制发布目录…" :
        job.state.stage === "zipping" ? "压缩中（大目录可能需要几分钟）…" :
        job.state.stage === "packaging" ? "UE 打包中…" :
        job.state.stage === "building" ? "Web 构建中…" :
        job.state.stage === "uploading" ? "上传中…" :
        job.state.stage === "installing" ? "安装 bdpan CLI…" : (job.state.stage || "运行中…")
      ) : "";
      var jobDoneLabel = job && job.state && !job.state.running
        ? (job.state.killed ? "任务已取消" : job.state.error ? "任务失败" : "任务完成")
        : "";

      var statusEl;
      if (job && job.state && job.state.running) {
        statusEl = h("span", {}, h("span", { className: "dsh-pack-spin" }), " ", stageLabel, " · " + fmtTime(job.state.elapsedMs));
      } else if (err) {
        statusEl = h("span", {}, "⚠ " + err);
      } else if (notice) {
        statusEl = h("span", {}, "✔ " + notice);
      } else if (root) {
        statusEl = h("span", {}, "就绪 · " + (root.hasBuild ? "有打包产物" : "无打包产物"));
      } else {
        statusEl = h("span", {}, "加载中…");
      }

      return h("div", { className: "dsh-pack" },
        h("div", { className: "dsh-pack-header" },
          packIcon(16),
          h("span", { className: "dsh-pack-proj", title: root ? root.projectRoot : "" },
            root ? (root.projectRoot || "未找到项目") : "加载中…"),
          root && root.ueDir ? h("span", { className: "dsh-pack-ue", title: root.ueDir }, "UE 5.7") : null,
          h("button", { className: "dsh-pack-actbtn", disabled: !!(job && job.state && job.state.running), onClick: reload }, "刷新")),
        h("div", { className: "dsh-pack-toolbar" },
          h("div", { className: "dsh-pack-seg" },
            h("button", { className: "dsh-pack-tabbtn" + (view === "pack" ? " on" : ""), onClick: function () { setView("pack"); } }, "UE 打包"),
            h("button", { className: "dsh-pack-tabbtn" + (view === "web" ? " on" : ""), onClick: function () { setView("web"); } }, "Web 构建"),
            h("button", { className: "dsh-pack-tabbtn" + (view === "release" ? " on" : ""), onClick: function () { setView("release"); } }, "发布"),
            h("button", { className: "dsh-pack-tabbtn" + (view === "upload" ? " on" : ""), onClick: function () { setView("upload"); } }, "上传")),
          job && job.state && job.state.running
            ? h("button", { className: "dsh-pack-actbtn danger", onClick: cancelJob }, "取消")
            : null),
        h("div", { className: "dsh-pack-body" },
          rootErr ? h("div", { className: "dsh-pack-err" }, rootErr) : null,
          body),
        job && job.state && (job.state.lines || []).length > 0
          ? h("div", { className: "dsh-pack-loghead" },
              job.state.running ? h("span", { className: "dsh-pack-spin" }) : null,
              job.state.running
                ? stageLabel + " · " + fmtTime(job.state.elapsedMs)
                : jobDoneLabel + " · 耗时 " + fmtTime(job.state.elapsedMs),
              job.state.running
                ? h("button", { className: "dsh-pack-actbtn", style: { marginLeft: "auto" }, onClick: cancelJob }, "取消")
                : null)
          : null,
        job && job.state && (job.state.lines || []).length > 0
          ? h("div", { className: "dsh-pack-log", ref: logRef }, (job.state.lines || []).join("\n"))
          : null,
        h("div", { className: "dsh-pack-statusbar" + (err ? " err" : notice ? " ok" : "") }, statusEl));
    }

    // ------------------------------------------------------------- entry
    var inject = ["slots", "sessions", "modules", "betterSidebar"];

    function apply(ctx) {
      ctx.effect(function () {
        ensureStyle();
        var dispose = ctx.betterSidebar.registerTab({
          id: "pack",
          title: function () { return "打包"; },
          icon: function (size) { return packIcon(size); },
          order: 160,
          single: true,
          component: function (p) { return h(PackPanel, p); },
        });
        return function () {
          try { dispose(); } catch (e) { /* already disposed */ }
          removeStyle();
        };
      }, "dsh-xcc-pack-tools: pack sidebar tab");
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
