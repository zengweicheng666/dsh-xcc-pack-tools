/**
 * dsh-xcc-pack-tools client half: registers the 'pack' sidebar tab into
 * dsh-better-sidebar (ctx.betterSidebar.registerTab) and renders the XCC
 * pack/build/release panel — plugin-internal UE packaging (UAT, engine
 * auto-detected from the .uproject, no Web step), standalone Web UI builds
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
      ".dsh-pack-link{color:#58a6ff;text-decoration:none;font-size:11px}",
      ".dsh-pack-link:hover{text-decoration:underline}",
      ".dsh-pack-log{flex:1;min-height:0;overflow:auto;background:#0d1117;border:1px solid rgba(148,163,184,.2);border-radius:6px;margin-top:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;line-height:1.55;padding:6px 8px;white-space:pre;word-break:normal;color:#c9d1d9}",
      ".dsh-pack-loghead{display:flex;align-items:center;gap:8px;font-size:11px;color:#8b949e;margin-top:8px}",
       ".dsh-pack-tasklogs{padding:0 10px}",
       ".dsh-pack-resizer{height:8px;cursor:ns-resize;position:relative}",
       ".dsh-pack-resizer:after{content:\"\";position:absolute;left:45%;right:45%;top:3px;height:2px;background:rgba(148,163,184,.45);border-radius:2px}",
       ".dsh-pack-separator{height:1px;background:rgba(148,163,184,.22);margin:8px 10px}",

      ".dsh-pack-progbar{height:6px;border-radius:3px;background:rgba(148,163,184,.22);overflow:hidden}",
      ".dsh-pack-progbar i{display:block;height:100%;background:#58a6ff;border-radius:3px;transition:width .6s ease}",
      ".dsh-pack-progbar i.indet{width:38%;animation:dsh-pack-indet 1.2s linear infinite}",
      "@keyframes dsh-pack-indet{0%{margin-left:-38%}100%{margin-left:100%}}",
      ".dsh-pack-progtext{margin-top:4px;font-size:11px;color:#8b949e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
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

    function fmtSpeed(bps) {
      if (bps === undefined || bps === null || !Number.isFinite(bps)) return "";
      if (bps >= 1048576) return (bps / 1048576).toFixed(2) + " MB/s";
      if (bps >= 1024) return (bps / 1024).toFixed(0) + " KB/s";
      return Math.round(bps) + " B/s";
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
          return { projectRoot: o.projectRoot || "" };
        }
      } catch (e) { /* ignore */ }
      return { projectRoot: "" };
    }

    function PackPanel(props) {
      var scope = props.scope || {};
      var sessionId = scope.sessionId;
      var overrides = useRef(loadOverrides());

      var [root, setRoot] = useState(null);
      var [rootErr, setRootErr] = useState("");
      var [view, setView] = useState("pack");
      var [job, setJob] = useState(null);        // latest job
      var [jobs, setJobs] = useState({});
      var [taskLogHeights, setTaskLogHeights] = useState({});
      var [taskLogs, setTaskLogs] = useState({});
      var [notice, setNotice] = useState("");
      var [err, setErr] = useState("");

      var [packOpts, setPackOpts] = useState({ buildConfig: "Development", skipCompile: false, cleanCook: false, closeEditor: false });
      var [webOpts, setWebOpts] = useState({ mode: "dev", targetDir: "" });
      var [manualNumber, setManualNumber] = useState("");
      var [preview, setPreview] = useState(null); // nextName result
      var [previewErr, setPreviewErr] = useState("");
      var [releasing, setReleasing] = useState(false);
      var [runBusy, setRunBusy] = useState(false);
      // UE engine path: manual entry, persisted server-side per project
      var [engineDir, setEngineDir] = useState("");
      var [engineBusy, setEngineBusy] = useState(false);
      // upload view state (Baidu open-platform direct API; no bdpan CLI)
      var [baidu, setBaidu] = useState(null);
      var [baiduConfig, setBaiduConfig] = useState({ clientId: "", clientSecret: "", appId: "", redirectUri: "", remoteRoot: "" });
      var [authUrl, setAuthUrl] = useState("");
      var [authCode, setAuthCode] = useState("");
      var [authBusy, setAuthBusy] = useState(false);
      var [localPath, setLocalPath] = useState(""); // empty = auto latest zip
      var [remoteDir, setRemoteDir] = useState("XCC-Deluxe/");

      var logRefs = { pack: useRef(null), webBuild: useRef(null), release: useRef(null), upload: useRef(null) };
      var timerRef = useRef(null);
      var jobRef = useRef(null);
      jobRef.current = job; // live mirror for effects/callbacks
      var seenRef = useRef({}); // per-kind: Set of log lines already shown — new tasks append without duplicates, and "clear log" won't resurrect old lines

      var base = { sessionId: sessionId };
      if (scope.cwd) base.cwd = scope.cwd;
      if (overrides.current.projectRoot) base.projectRoot = overrides.current.projectRoot;

      // keep the engine-path input in sync with the resolved/saved engine dir
      useEffect(function () {
        if (root && (root.ueDir || root.ueSavedDir)) setEngineDir(root.ueSavedDir || root.ueDir);
      }, [root ? (root.ueDir || root.ueSavedDir) : null]);

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
      }, [sessionId, base.projectRoot]);

      useEffect(function () { reload(); }, [reload]);

      // resume a server-side running job after a page refresh
      useEffect(function () { resumeActiveJob(); }, []);

      // refresh Baidu open-platform status whenever the upload view is opened
      useEffect(function () {
        if (view === "upload") loadBaiduStatus();
      }, [view]);

      var failRef = useRef(0); // consecutive poll failures

      // poll the running job every 1.5s
      useEffect(function () {
        if (!job || !job.jobId) return;
        var pollMethod = job.kind === "pack" ? "packPoll"
          : job.kind === "webBuild" ? "webBuildPoll"
          : job.kind === "release" ? "releasePoll"
          : job.kind === "upload" ? "uploadPoll"
          : "releasePoll";
        var tick = function () {
          post(pollMethod, { jobId: job.jobId })
            .then(function (st) {
              failRef.current = 0;
              setJob({ jobId: job.jobId, kind: job.kind, state: st });
              setJobs(function (all) { var next = Object.assign({}, all); next[job.kind] = { jobId: job.jobId, state: st }; return next; });
              setTaskLogs(function (all) {
                // Append only lines not already shown for this kind: keeps the
                // per-tab buffer growing (never clears on a new task) while
                // deduplicating the server's rolling log window.
                var next = Object.assign({}, all);
                var incoming = st.lines || [];
                if (incoming.length) {
                  var seen = seenRef.current[job.kind];
                  if (!seen) { seen = new Set(); seenRef.current[job.kind] = seen; }
                  if (seen.size > 10000) seen.clear(); // bound memory (rare)
                  var fresh = [];
                  for (var i = 0; i < incoming.length; i++) {
                    if (!seen.has(incoming[i])) { seen.add(incoming[i]); fresh.push(incoming[i]); }
                  }
                  if (fresh.length) next[job.kind] = (next[job.kind] || []).concat(fresh);
                }
                return next;
              });
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
                  if (job.kind === "upload" && st.result && st.result.shareLink) {
                    navigator.clipboard && navigator.clipboard.writeText(st.result.shareLink).catch(function () {});
                    setNotice("上传完成，分享链接已复制 ✔");
                  }
                }
                reload();
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

      // auto-scroll the current tab's own log panel (track the local buffer length)
      var viewKind = view === "web" ? "webBuild" : view === "release" ? "release" : view === "upload" ? "upload" : "pack";
      var currentLogLen = (taskLogs[viewKind] || []).length;
      useEffect(function () {
        var el = logRefs[viewKind].current;
        if (el) el.scrollTop = el.scrollHeight;
      }, [currentLogLen, viewKind]);

      function clearLog(kind) {
        setTaskLogs(function (all) { var next = Object.assign({}, all); delete next[kind]; return next; });
        // Keep seenRef[kind]: lines already shown stay "seen", so they won't
        // resurrect on the next poll; only genuinely new lines appear after.
      }

      function taskLog(kind, state) {
        var lines = (state && state.lines) || [];
        var current = taskLogs[kind] || [];
        var merged = current.slice();
        lines.forEach(function (line) { if (merged.indexOf(line) < 0) merged.push(line); });
        return merged;
      }

      function resizeTaskLog(kind, event) {
        event.preventDefault();
        var startY = event.clientY;
        var startHeight = taskLogHeights[kind] || 180;
        var move = function (e) {
          var height = Math.max(80, Math.min(600, startHeight + e.clientY - startY));
          setTaskLogHeights(function (all) { var next = Object.assign({}, all); next[kind] = height; return next; });
        };
        var stop = function () { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", stop); };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", stop);
      }

      var STAGE_LABELS = {
        pack: { packaging: "UE 打包中", done: "打包完成" },
        webBuild: { building: "Web 构建中", done: "构建完成" },
        release: { copying: "复制发布目录", zipping: "压缩中", done: "发布完成" },
        upload: { hashing: "计算分片校验", uploading: "上传分片", creating: "创建网盘文件", done: "上传完成" }
      };

      // 任务状态行：运行中 → 阶段 + 已用时；结束 → 完成/失败/取消 + 耗时。
      function taskStatusLine(kind, entry) {
        if (!entry || !entry.state) return null;
        var st = entry.state;
        var elapsed = fmtTime(st.elapsedMs);
        if (st.running) {
          var stage = st.stage || "";
          return "运行中 · " + (STAGE_LABELS[kind] && STAGE_LABELS[kind][stage] ? STAGE_LABELS[kind][stage] : stage || "处理中") + " · 已用时 " + elapsed;
        }
        if (st.killed) return "已取消 · 耗时 " + elapsed;
        if (st.error) return "失败 · " + st.error + " · 耗时 " + elapsed;
        return "完成 · 耗时 " + elapsed;
      }

      // 进度详情：按任务类型展示 阶段/百分比/已传/总量/速度/剩余时间。
      function progressParts(kind, p) {
        if (!p) return [];
        var parts = [];
        if (p.label) parts.push(p.label);
        if (p.percent !== undefined && p.percent !== null) parts.push(p.percent + "%");
        if (p.speed !== undefined && p.speed !== null && p.speed > 0) parts.push(fmtSpeed(p.speed));
        if (p.sent !== undefined && p.total) {
          var doneWord = kind === "upload" ? "已传" : "已完成";
          parts.push(doneWord + " " + fmtSize(p.sent) + " / " + fmtSize(p.total));
        }
        if (p.sent !== undefined && p.total && p.sent < p.total) parts.push("剩余 " + fmtSize(p.total - p.sent));
        if (p.etaSec !== undefined && p.etaSec > 0) parts.push("约 " + fmtTime(p.etaSec * 1000) + " 后完成");
        if (p.etaSec === 0) parts.push("即将完成");
        if (kind === "upload" && p.sent === undefined) parts.push("共 " + fmtSize(p.total));
        return parts;
      }

      function renderTaskProgress(kind, entry) {
        var p = entry && entry.state && entry.state.progress;
        var st = entry && entry.state;
        if (!st) return null;
        var pct = (p && p.percent !== undefined && p.percent !== null) ? p.percent : null;
        var parts = progressParts(kind, p);
        if (parts.length === 0) parts.push("准备中…");
        return h("div", { className: "dsh-pack-prog" },
          h("div", { className: "dsh-pack-progbar" },
            pct !== null ? h("i", { style: { width: pct + "%" } }) : h("i", { className: "indet" })),
          h("div", { className: "dsh-pack-progtext" }, parts.join(" · ")));
      }

      // 单个类型任务的日志栏：属于各自分页内部（无日志时显示占位），
      // 日志/进度/清空/高度调整均只作用于该类型，互不影响。
      // 显示源固定为本地累积 taskLogs[kind]：新任务不清空、尾部追加。
      function renderTaskLog(kind, name) {
        var entry = jobs[kind];
        var lines = taskLogs[kind] || [];
        var status = taskStatusLine(kind, entry);
        return h("div", { className: "dsh-pack-task" },
          h("div", { className: "dsh-pack-loghead" }, name, h("span", { style: { color: "#8b949e" } }, status || "暂无任务"), h("button", { className: "dsh-pack-mini", style: { marginLeft: "auto" }, onClick: function () { clearLog(kind); } }, "清空日志")),
          renderTaskProgress(kind, entry),
          h("div", { className: "dsh-pack-resizer", onPointerDown: function (e) { resizeTaskLog(kind, e); }, title: "上下拖动调整日志高度" }),
          h("div", { ref: logRefs[kind], className: "dsh-pack-log", style: { height: (taskLogHeights[kind] || 180) + "px" } }, lines.length ? lines.join("\n") : "暂无任务日志"));
      }

      // (job.state === null means "started, not yet polled") — after that it
      // stays running only while job.state.running is true, so a finished job
      // releases the buttons and clears the "构建中/发布中" labels.
      function isJobRunning(kind) {
        return !!(job && job.kind === kind && (!job.state || job.state.running));
      }

      function startJob(kind, body, doneName) {
        setErr("");
        setNotice("");
        var method = kind === "pack" ? "packStart"
          : kind === "webBuild" ? "webBuildStart"
          : kind === "release" ? "releaseStart"
          : kind === "upload" ? "uploadStart"
          : "releaseStart";
        post(method, Object.assign({}, base, body))
          .then(function (v) {
            if (kind === "release") setNotice("发布任务已启动：" + (v.name || ""));
            if (kind === "upload") setNotice("上传任务已启动：" + (v.name || ""));
            setJob({ jobId: v.jobId, kind: kind, state: null });
          })
          .catch(function (e) {
            setErr(e.message);
            if (e.code === "busy") resumeActiveJob(); // surface the running task
          });
      }

      function cancelJob() {
        if (!job || !job.jobId) return;
        post("kill", { jobId: job.jobId }).catch(function (e) { setErr("取消失败：" + e.message); });
      }

      // After a page refresh the client has no job state, but server-side
      // jobs keep running — resume the newest running job so the panel shows
      // its progress/log/cancel again instead of the busy-409 dead end.
      function resumeActiveJob() {
        post("activeJobs", {})
          .then(function (v) {
            var list = (v.jobs || []).filter(function (j) { return j.running && j.jobId; });
            if (list.length === 0 || jobRef.current) return;
            var j = list[0];
            setJob({ jobId: j.jobId, kind: j.kind, state: null });
            setNotice("已恢复运行中的任务（" + j.kind + "）");
            setErr("");
          })
          .catch(function () { /* ignore */ });
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

      // persist the manually entered engine root for THIS project (server-side,
      // ~/.dsh/dsh-xcc-pack-tools-settings.json → enginePaths[projectRoot])
      function saveEngine() {
        setErr(""); setNotice(""); setEngineBusy(true);
        post("packEngineSet", Object.assign({}, base, { engineDir: engineDir.trim() }))
          .then(function () { setNotice("引擎目录已保存 ✔"); reload(); })
          .catch(function (e) { setErr(e.message); })
          .finally(function () { setEngineBusy(false); });
      }

      // drop the saved engine path so auto-detection is used again
      function clearEngine() {
        setErr(""); setNotice(""); setEngineBusy(true);
        post("packEngineSet", Object.assign({}, base, { engineDir: "" }))
          .then(function () { setEngineDir(""); setNotice("已清除手动引擎目录，恢复自动识别 ✔"); reload(); })
          .catch(function (e) { setErr(e.message); })
          .finally(function () { setEngineBusy(false); });
      }

      // ------------------------------------------------ view: pack
      function PackView() {
        var busy = isJobRunning("pack");
        var ueSourceLabel = root && root.ueSource ? ({
          saved: "手动保存",
          registry: "自动识别 · 注册表",
          launcher: "自动识别 · Epic 启动器",
          scan: "自动识别 · 常见安装目录",
          env: "环境变量 XCC_UE_DIR",
          requested: "本次运行指定"
        }[root.ueSource] || root.ueSource) : null;
        return h("div", {},
          h("div", { className: "dsh-pack-card" },
            h("h4", {}, "UE 打包"),
            h("div", { className: "dsh-pack-kv" }, "输出目录：", h("b", { className: "dsh-pack-path", title: root ? root.outputDir : "" }, root ? root.outputDir : "—")),
            h("div", { className: "dsh-pack-kv" }, "工程文件：", h("b", { className: "dsh-pack-path", title: root ? (root.uproject || "") : "" }, root ? (root.uproject || "—") : "…")),
            h("div", { className: "dsh-pack-kv" },
              "UE 引擎：",
              h("b", { className: "dsh-pack-path", title: root && root.ueDir ? root.ueDir : "" },
                root && root.ueDir ? root.ueDir : (root ? "未识别（自动识别失败）" : "…")),
              root && root.ueDir && ueSourceLabel
                ? h("span", { style: { color: "#8b949e", flexShrink: 0, fontSize: 10 } }, " · " + ueSourceLabel)
                : null),
            h("div", { className: "dsh-pack-kv" },
              "UE 版本：",
              h("b", {}, root
                ? (root.ueVersion ? "UE " + root.ueVersion
                  : (root.ueAssociation ? root.ueAssociation + "（源码引擎，需手动指定路径）" : "未知（uproject 缺少 EngineAssociation）"))
                : "…")),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "引擎目录"),
              h("input", { className: "dsh-pack-input",
                placeholder: (root && (root.ueDir || root.ueSavedDir))
                  ? "修改后点「保存为引擎目录」生效"
                  : "填写引擎根目录（含 Engine\\Build\\BatchFiles\\RunUAT.bat），如 D:\\EpicLib\\UE_" + (root && root.ueVersion ? root.ueVersion : "5.7"),
                value: engineDir,
                onChange: function (e) { setEngineDir(e.target.value); } })),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn", disabled: !root || engineBusy || engineDir.trim() === "", onClick: saveEngine },
                engineBusy ? "保存中…" : "保存为引擎目录"),
              root && root.ueSavedDir
                ? h("button", { className: "dsh-pack-mini", disabled: engineBusy, onClick: clearEngine }, "恢复自动识别")
                : null),
            !root || root.ueDir ? null : h("div", { className: "dsh-pack-warn" },
              "未能自动定位 UE 引擎：已按 注册表（HKLM …Unreal Engine\\" + (root.ueVersion || "x.x") + "）→ Epic 启动器安装记录 → 常见安装目录 顺序查找，均未命中。请在下方填写引擎根目录（须含 Engine\\Build\\BatchFiles\\RunUAT.bat）并「保存为引擎目录」，保存后自动识别不再需要。"),
            h("div", { className: "dsh-pack-row" },
              h("span", { className: "dsh-pack-lbl" }, "BuildConfig"),
              h("select", { className: "dsh-pack-select", value: packOpts.buildConfig,
                onChange: function (e) { setPackOpts(Object.assign({}, packOpts, { buildConfig: e.target.value })); } },
                h("option", { value: "Development" }, "Development"),
                h("option", { value: "Shipping" }, "Shipping"),
                h("option", { value: "Debug" }, "Debug"))),
            h("label", { className: "dsh-pack-check" }, h("input", { type: "checkbox", checked: packOpts.skipCompile, onChange: function (e) { setPackOpts(Object.assign({}, packOpts, { skipCompile: e.target.checked })); } }), "跳过 C++ 编译（UAT 以 -nocompile 运行）"),
            h("label", { className: "dsh-pack-check" }, h("input", { type: "checkbox", checked: packOpts.cleanCook, onChange: function (e) { setPackOpts(Object.assign({}, packOpts, { cleanCook: e.target.checked })); } }), "清理 Cook 缓存（慢，缓存损坏时用）"),
            h("label", { className: "dsh-pack-check" }, h("input", { type: "checkbox", checked: packOpts.closeEditor, onChange: function (e) { setPackOpts(Object.assign({}, packOpts, { closeEditor: e.target.checked })); } }), "允许关闭运行中的 Unreal Editor"),
            packOpts.closeEditor ? h("div", { className: "dsh-pack-warn" }, "勾选后打包流程会先关闭正在运行的 Unreal Editor（可能丢失未保存内容）。") : null,
            h("div", { className: "dsh-pack-note" }, "流程：检查/关闭 Unreal Editor →（可选）C++ 编译 →（可选）清理 Cook 缓存 → Cook & 打包（UAT，约 1 小时级，日志实时流式显示）。打包由插件内建执行，不含 Web UI 构建——Web 产物请用「Web 构建」分页单独构建。"),
            h("div", { className: "dsh-pack-row" },
              h("button", { className: "dsh-pack-actbtn primary", disabled: busy || !root || !root.ueDir, title: root && !root.ueDir ? "请先填写并保存引擎目录" : undefined, onClick: function () {
                startJob("pack", {
                  skipCompile: packOpts.skipCompile,
                  cleanCook: packOpts.cleanCook, closeEditor: packOpts.closeEditor,
                  buildConfig: packOpts.buildConfig,
                });
              } }, busy ? "打包中…" : "开始打包"))),
          root && root.hasBuild ? null : h("div", { className: "dsh-pack-warn" }, "当前没有可用打包产物（Saved\\Windows\\XCC.exe 不存在），请先执行 UE 打包。"),
          renderTaskLog("pack", "UE 打包"));
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
              } }, busy ? "构建中…" : "开始构建"))),
          renderTaskLog("webBuild", "Web 构建"));
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
                }))),
          renderTaskLog("release", "发布"));
      }

      // --------------------------------------------- view: upload (Baidu direct API)
      function loadBaiduStatus() {
        post("baiduStatus", {})
          .then(function (v) { setBaidu(v); setBaiduConfig(Object.assign({}, baiduConfig, v.config || {})); })
          .catch(function (e) { setBaidu({ error: e.message, configured: false, authorized: false }); });
      }

      function saveBaiduSettings() {
        setErr(""); setNotice(""); setAuthBusy(true);
        post("baiduSettingsSet", baiduConfig)
          .then(function (v) {
            setBaidu(Object.assign({}, baidu || {}, { configured: !!(v.config && v.config.clientId && v.config.appId && v.config.redirectUri && v.config.remoteRoot && v.config.hasClientSecret), config: v.config }));
            setBaiduConfig(Object.assign({}, baiduConfig, { clientSecret: "" })); // never keep the secret in UI state
            setNotice("百度开放平台设置已保存 ✔");
          })
          .catch(function (e) { setErr(e.message); })
          .finally(function () { setAuthBusy(false); });
      }

      function getAuthUrl() {
        setErr(""); setAuthUrl(""); setAuthBusy(true);
        post("baiduAuthorizationUrl", {})
          .then(function (v) { setAuthUrl(v.url); })
          .catch(function (e) { setErr(e.message); })
          .finally(function () { setAuthBusy(false); });
      }

      function submitAuthCode() {
        setErr(""); setNotice(""); setAuthBusy(true);
        post("baiduAuthorizeCode", { code: authCode.trim() })
          .then(function () { setAuthCode(""); setAuthUrl(""); setNotice("百度开放平台授权成功 ✔"); loadBaiduStatus(); })
          .catch(function (e) { setErr(e.message); })
          .finally(function () { setAuthBusy(false); });
      }

      function UploadView() {
        var busy = isJobRunning("upload");
        var latestZip = root ? (root.latestZip || null) : null;
        var filePath = localPath.trim() || (latestZip ? latestZip.path : "");
        var remoteDirVal = remoteDir.trim() || "XCC-Deluxe/";
        var zipName = filePath ? filePath.replace(/\\/g, "/").split("/").pop() : "";
        var appRoot = (baidu && baidu.config && baidu.config.remoteRoot) || baiduConfig.remoteRoot || "/apps/<应用目录>";
        var remotePreview = zipName ? appRoot.replace(/\/+$/, "") + "/" + remoteDirVal.replace(/\/+$/, "") + "/" + zipName : "—";
        var configured = !!(baidu && baidu.configured);
        var authorized = !!(baidu && baidu.authorized);

        return h("div", {},
          h("div", { className: "dsh-pack-card" },
            h("h4", {}, "百度开放平台设置（直连分片上传）"),
            h("div", { className: "dsh-pack-note" }, "不再使用 bdpan CLI。Secret Key 与 Token 仅在本机以 Windows DPAPI 加密保存，界面不会回显。应用根目录必须与百度开放平台为该 App 分配的 /apps/<应用目录> 一致。"),
            h("div", { className: "dsh-pack-kv" },
              "快捷链接：",
              h("a", { className: "dsh-pack-link", href: "https://pan.baidu.com/union", target: "_blank", rel: "noreferrer" }, "开放平台控制台"),
              " · ",
              h("a", { className: "dsh-pack-link", href: "https://pan.baidu.com/union/doc/%E4%BD%BF%E7%94%A8%E5%85%A5%E9%97%A8/%E6%8E%A5%E5%85%A5%E6%8E%88%E6%9D%83/%E6%8E%88%E6%9D%83%E7%A0%81%E6%A8%A1%E5%BC%8F/", target: "_blank", rel: "noreferrer" }, "授权码模式文档"),
              " · ",
              h("a", { className: "dsh-pack-link", href: "https://pan.baidu.com/union/doc/%E5%9F%BA%E7%A1%80%E7%BD%91%E7%9B%98%E6%9C%8D%E5%8A%A1/%E4%B8%8A%E4%BC%A0/%E5%88%86%E7%89%87%E4%B8%8A%E4%BC%A0/", target: "_blank", rel: "noreferrer" }, "分片上传文档")),
            h("div", { className: "dsh-pack-row" }, h("span", { className: "dsh-pack-lbl" }, "App Key"), h("input", { className: "dsh-pack-input", placeholder: "client_id", value: baiduConfig.clientId || "", onChange: function (e) { setBaiduConfig(Object.assign({}, baiduConfig, { clientId: e.target.value })); } })),
            h("div", { className: "dsh-pack-row" }, h("span", { className: "dsh-pack-lbl" }, "Secret Key"), h("input", { className: "dsh-pack-input", type: "password", placeholder: (baidu && baidu.config && baidu.config.hasClientSecret) ? "已保存；留空不修改" : "client_secret", value: baiduConfig.clientSecret || "", onChange: function (e) { setBaiduConfig(Object.assign({}, baiduConfig, { clientSecret: e.target.value })); } })),
            h("div", { className: "dsh-pack-row" }, h("span", { className: "dsh-pack-lbl" }, "App ID"), h("input", { className: "dsh-pack-input", placeholder: "数字 app_id", value: baiduConfig.appId || "", onChange: function (e) { setBaiduConfig(Object.assign({}, baiduConfig, { appId: e.target.value })); } })),
            h("div", { className: "dsh-pack-row" }, h("span", { className: "dsh-pack-lbl" }, "Redirect URI"), h("input", { className: "dsh-pack-input", placeholder: "必须与开放平台登记值完全一致", value: baiduConfig.redirectUri || "", onChange: function (e) { setBaiduConfig(Object.assign({}, baiduConfig, { redirectUri: e.target.value })); } })),
            h("div", { className: "dsh-pack-row" }, h("span", { className: "dsh-pack-lbl" }, "应用根目录"), h("input", { className: "dsh-pack-input", placeholder: "/apps/<你的应用目录>", value: baiduConfig.remoteRoot || "", onChange: function (e) { setBaiduConfig(Object.assign({}, baiduConfig, { remoteRoot: e.target.value })); } })),
            h("div", { className: "dsh-pack-row" }, h("button", { className: "dsh-pack-actbtn primary", disabled: authBusy, onClick: saveBaiduSettings }, authBusy ? "保存中…" : "保存设置"), h("button", { className: "dsh-pack-actbtn", onClick: loadBaiduStatus }, "重新检测")),
            configured ? h("div", { className: authorized ? "dsh-pack-name" : "dsh-pack-warn" }, authorized ? "配置完成，已授权 ✔" : "配置完成，但尚未 OAuth 授权") : null,
            configured && !authorized ? h("div", {},
              h("div", { className: "dsh-pack-row" }, h("button", { className: "dsh-pack-actbtn primary", disabled: authBusy, onClick: getAuthUrl }, authBusy ? "生成中…" : "获取授权链接")),
              authUrl ? h("div", { className: "dsh-pack-name" }, h("a", { href: authUrl, target: "_blank", rel: "noreferrer" }, "点击授权；完成后复制回调 URL 或 code")) : null,
              h("div", { className: "dsh-pack-row" }, h("span", { className: "dsh-pack-lbl" }, "回调 URL/code"), h("input", { className: "dsh-pack-input", placeholder: "粘贴完整回调 URL 或 code", value: authCode, onChange: function (e) { setAuthCode(e.target.value); } })),
              h("div", { className: "dsh-pack-row" }, h("button", { className: "dsh-pack-actbtn primary", disabled: authBusy || !authCode.trim(), onClick: submitAuthCode }, "完成授权"))) : null),
          h("div", { className: "dsh-pack-card" },
            h("h4", {}, "上传发布包（断点续传）"),
            h("div", { className: "dsh-pack-kv" }, "自动匹配：", h("b", {}, latestZip ? latestZip.name + ".zip" : "无发布 zip"), latestZip ? h("span", {}, " · " + fmtSize(latestZip.size) + " · " + fmtDate(latestZip.mtime)) : null),
            h("div", { className: "dsh-pack-row" }, h("span", { className: "dsh-pack-lbl" }, "本地文件"), h("input", { className: "dsh-pack-input", placeholder: latestZip ? "留空 = 最新发布 " + latestZip.name + ".zip" : "选择要上传的文件", value: localPath, onChange: function (e) { setLocalPath(e.target.value); } })),
            h("div", { className: "dsh-pack-row" }, h("span", { className: "dsh-pack-lbl" }, "网盘目录"), h("input", { className: "dsh-pack-input", placeholder: "相对应用根目录，如 XCC-Deluxe/", value: remoteDirVal, onChange: function (e) { setRemoteDir(e.target.value); } })),
            h("div", { className: "dsh-pack-kv" }, "上传到：", h("b", {}, remotePreview)),
            h("div", { className: "dsh-pack-note" }, "按 4MB 分片直传；每成功一片即保存 uploadid 与完成清单。取消、刷新、重启后再次上传相同文件和路径会继续未完成分片。"),
            h("div", { className: "dsh-pack-row" }, h("button", { className: "dsh-pack-actbtn primary", disabled: busy || !configured || !authorized || !filePath, onClick: function () { startJob("upload", { localPath: localPath.trim() || undefined, remoteDir: remoteDirVal }); } }, busy ? "上传中…" : "开始上传"))),
          renderTaskLog("upload", "上传"));
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
        job.state.stage === "hashing" ? "计算分片校验…" :
        job.state.stage === "creating" ? "创建网盘文件…" : (job.state.stage || "运行中…")
      ) : "";
      var kindLabel = job ? (
        job.kind === "pack" ? "UE 打包" :
        job.kind === "webBuild" ? "Web 构建" :
        job.kind === "release" ? "发布" :
        job.kind === "upload" ? "上传" : job.kind
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
          root && root.ueDir ? h("span", { className: "dsh-pack-ue", title: root.ueDir }, "UE " + (root.ueVersion || root.ueAssociation || "")) : null,
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
