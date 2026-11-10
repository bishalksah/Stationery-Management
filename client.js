let profile = { name: "", username: "", photo: "", role: "staff" };
      let profilePhotoDraft = "";
      let items = [];
      let tx = [];
      let notifications = [], unreadNotificationCount = 0, notificationTimer = null, notificationBusy = false;
      let sortDesc = false,
        toastTimer;
      const canManage = () => ["admin", "staff"].includes(profile.role);
      let setupMode = false;
      const cats = [
        "Notebooks",
        "Pens",
        "Pencils",
        "Paper / Files",
        "Office Supplies",
        "Drawing Tools",
        "Lab Manuals",
        "Art & Craft",
      ];
      const categoryIcons = {
        Notebooks: "📓", Pens: "🖊️", Pencils: "✏️", "Paper / Files": "📁",
        "Office Supplies": "📄", "Drawing Tools": "📐", "Lab Manuals": "📗", "Art & Craft": "🎨",
      };
      // Some legacy MySQL rows contain question marks where their original
      // emoji and middle-dot separators were lost. Keep those rows legible.
      function itemIcon(item) {
        const saved = String(item.icon || "");
        return !saved || /\?{2,}/u.test(saved) ? (categoryIcons[item.category] || "📦") : saved;
      }
      function displayBrand(brand) {
        return String(brand || "").replace(/\?{2,}/g, "·");
      }
      const today = new Date();
      function applyTheme(theme){
        const mode=theme==="night"?"night":"day";
        document.documentElement.dataset.theme=mode;
        try{localStorage.setItem("quest-stationery-theme",mode);}catch{}
        const toggle=document.getElementById("themeToggle"),icon=document.getElementById("themeToggleIcon");
        if(toggle&&icon){const night=mode==="night";icon.textContent=night?"☀":"☾";toggle.setAttribute("aria-pressed",String(night));toggle.setAttribute("aria-label",night?"Switch to daylight mode":"Switch to night mode");toggle.title=night?"Switch to daylight mode":"Switch to night mode";}
      }
      function toggleTheme(){applyTheme(document.documentElement.dataset.theme==="night"?"day":"night");}
      let initialTheme="day";try{initialTheme=localStorage.getItem("quest-stationery-theme")==="night"?"night":"day";}catch{}applyTheme(initialTheme);
      document.getElementById("footerYear").textContent = String(today.getFullYear());
      document.getElementById("today").textContent = today.toLocaleDateString(
        "en-IN",
        { day: "numeric", month: "short", year: "numeric" },
      );
      document.getElementById("dateLong").textContent = today
        .toLocaleDateString("en-IN", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
        .toUpperCase();
      document.getElementById("datePicker").value =
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      async function api(path, options = {}) {
        const response = await fetch(path, { credentials: "same-origin", ...options,
          headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
        let result = {};
        try { result = await response.json(); } catch {}
        if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
        if (options.method && options.method !== "GET" && path !== "/api/logout" && path !== "/api/notifications") {
          loadNotifications({ silent: true });
        }
        return result;
      }
      function showAuth(needsSetup) {
        setupMode = needsSetup;
        document.getElementById("appRoot").style.display = "none";
        document.getElementById("authScreen").style.display = "grid";
        document.getElementById("authNameField").style.display = needsSetup ? "block" : "none";
        document.getElementById("authName").required = needsSetup;
        document.getElementById("authHeading").textContent = needsSetup ? "Set up your store" : "Welcome back";
        document.getElementById("authEyebrow").textContent = needsSetup ? "FIRST-TIME SETUP" : "STORE ACCESS";
        document.getElementById("authCopy").textContent = needsSetup ? "Create the first administrator account to protect your store data." : "Sign in to manage stationery inventory.";
        document.getElementById("authSubmit").textContent = needsSetup ? "Create administrator account" : "Sign in";
        document.getElementById("authPassword").autocomplete = needsSetup ? "new-password" : "current-password";
        document.getElementById("authPassword").minLength = needsSetup ? 10 : 1;
        document.getElementById("authError").textContent = "";
      }
      async function reloadData() {
        const [loadedItems, loadedTx, loadedProfile] = await Promise.all([
          api("/api/items"), api("/api/transactions"), api("/api/profile")
        ]);
        items = loadedItems; tx = loadedTx.map(t => ({...t, dateKey: new Date(t.when).toDateString()})); profile = loadedProfile;
        if (document.getElementById("issueForm")) document.getElementById("issueForm").elements.issuedBy.value = profile.name;
        render();
        renderProfile();
        loadNotifications({ silent: true });
      }
      async function initializeApp() {
        try {
          const session = await api("/api/session");
          if (!session.authenticated) { showAuth(session.needsSetup); return; }
          profile = session.user;
          document.getElementById("authScreen").style.display = "none";
          document.getElementById("appRoot").style.display = "block";
          await reloadData();
          startNotificationPolling();
        } catch (error) {
          showAuth(true);
          document.getElementById("authError").textContent = `Could not reach the app server. Start it with npm start. ${error.message}`;
        }
      }
      document.getElementById("authForm").addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = document.getElementById("authSubmit");
        submit.disabled = true;
        document.getElementById("authError").textContent = "";
        const payload = { username: document.getElementById("authUsername").value.trim(), password: document.getElementById("authPassword").value };
        if (setupMode) payload.name = document.getElementById("authName").value.trim();
        try {
          const result = await api(setupMode ? "/api/setup" : "/api/login", { method: "POST", body: JSON.stringify(payload) });
          profile = result.user;
          document.getElementById("authForm").reset();
          document.getElementById("authScreen").style.display = "none";
          document.getElementById("appRoot").style.display = "block";
          await reloadData();
          startNotificationPolling();
          toast(setupMode ? "Administrator account created." : "Signed in successfully.");
        } catch (error) {
          document.getElementById("authError").textContent = error.message;
        } finally { submit.disabled = false; }
      });
      async function signOut() {
        try { await api("/api/logout", { method: "POST", body: "{}" }); }
        catch (error) { toast(error.message); return; }
        if(notificationTimer){clearInterval(notificationTimer);notificationTimer=null;}
        closeProfile(); document.getElementById("appRoot").style.display = "none";
        document.getElementById("authUsername").value = "";
        document.getElementById("authPassword").value = "";
        showAuth(false);
      }
      function openDatePicker() {
        let p = document.getElementById("datePicker");
        if (p.showPicker) p.showPicker();
        else {
          p.focus();
          p.click();
        }
      }
      function setDashboardDate(value) {
        if (!value) return;
        let [y, m, d] = value.split("-").map(Number),
          selected = new Date(y, m - 1, d);
        document.getElementById("today").textContent =
          selected.toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
        document.getElementById("dateLong").textContent = selected
          .toLocaleDateString("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })
          .toUpperCase();
        document.querySelector(".eyebrow").childNodes[0].textContent =
          selected
            .toLocaleDateString("en-IN", { weekday: "long" })
            .toUpperCase() + ", ";
      }
      function status(i) {
        return i.qty === 0 ? "out" : i.qty <= i.threshold ? "low" : "in";
      }
      function toast(s) {
        let el = document.getElementById("toast");
        el.textContent = s;
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
      }
      function profileInitials(name) {
        return (
          (name || "MS")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((x) => x[0] || "")
            .join("")
            .toUpperCase() || "MS"
        );
      }
      function renderProfile() {
        let initials = profileInitials(profile.name);
        document.querySelectorAll("[data-profile-avatar]").forEach((el) => {
          if (profile.photo) { const img=document.createElement("img"); img.src=profile.photo; img.alt=""; el.replaceChildren(img); }
          else el.textContent=initials;
        });
        let label = document.getElementById("profileNameLabel");
        if (label) label.textContent = profile.name;
        let greeting = document.getElementById("greetingName");
        if (greeting) greeting.textContent = profile.name;
        let storeName = document.getElementById("settingsStoreName");
        if (storeName) storeName.textContent = profile.name;
        let adminPanel = document.getElementById("staffAdminPanel");
        if (adminPanel) adminPanel.style.display = profile.role === "admin" ? "block" : "none";
        document.querySelectorAll('.nav button[data-page="add"]').forEach(el=>el.style.display=canManage()?"flex":"none");
        document.querySelectorAll('.nav button[data-page="settings"]').forEach(el=>el.style.display=profile.role==="admin"?"flex":"none");
        document.querySelectorAll('#issueForm .form-actions').forEach(el=>el.style.display=canManage()?"flex":"none");
        document.querySelectorAll("#page-dashboard .hello-row > button, #page-inventory .hello-row > button").forEach(el=>el.style.display=canManage()?"inline-flex":"none");
        const issueCard=document.getElementById("issueForm").closest(".card"); if(issueCard) issueCard.style.display=canManage()?"block":"none";
        document.getElementById("requisitionFormCard").style.display=profile.role==="viewer"?"none":"block";
        document.getElementById("requestDepartment").value=profile.department||"";
        document.getElementById("requisitionIntro").textContent=profile.role==="admin"?"Review department requests. Approving a request issues stock and creates an audit record.":profile.role==="staff"?"Review department requests and track their status.":"Request supplies for your department and follow approval status.";
        document.getElementById("requisitionListTitle").textContent=(profile.role==="admin"||profile.role==="staff")?"Department requisitions":"My requisitions";
      }
      function openProfile() {
        profilePhotoDraft = profile.photo || "";
        document.getElementById("profileName").value = profile.name || "";
        document.getElementById("profileUsername").value =
          profile.username || "";
        document.getElementById("profilePassword").value = "";
        document.getElementById("profilePasswordConfirm").value = "";
        let preview = document.getElementById("profilePhotoPreview");
        if (profilePhotoDraft) { const img=document.createElement("img");img.src=profilePhotoDraft;img.alt="Profile photo";preview.replaceChildren(img); }
        else preview.textContent=profileInitials(profile.name);
        document.getElementById("profilePhoto").value = "";
        document.getElementById("profileModal").classList.add("open");
      }
      function closeProfile() {
        document.getElementById("profileModal").classList.remove("open");
      }
      document
        .getElementById("profilePhoto")
        .addEventListener("change", (e) => {
          let file = e.target.files?.[0];
          if (!file) return;
          if (file.size > 1024 * 1024) {
            toast("Choose an image under 1 MB.");
            e.target.value = "";
            return;
          }
          let reader = new FileReader();
          reader.onload = () => {
            profilePhotoDraft = String(reader.result);
            const img=document.createElement("img");img.src=profilePhotoDraft;img.alt="Profile photo";document.getElementById("profilePhotoPreview").replaceChildren(img);
          };
          reader.readAsDataURL(file);
        });
      document.getElementById("profileForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        const pass = document.getElementById("profilePassword").value;
        const confirmPass = document.getElementById("profilePasswordConfirm").value;
        if (pass && pass.length < 10) { toast("Use at least 10 characters for the password."); return; }
        if (pass !== confirmPass) { toast("The passwords do not match."); return; }
        const update = { name: document.getElementById("profileName").value.trim(), username: document.getElementById("profileUsername").value.trim(), photo: profilePhotoDraft };
        try {
          if (pass) await api("/api/profile/password", { method: "POST", body: JSON.stringify({ password: pass }) });
          profile = await api("/api/profile", { method: "PATCH", body: JSON.stringify(update) });
          renderProfile(); closeProfile();
          toast(pass ? "Profile and password updated." : "Profile updated.");
        } catch (error) { toast(error.message); }
      });
      function fmt(n) {
        return Number(n).toLocaleString("en-IN");
      }
      function esc(s) {
        return String(s ?? "").replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#39;",
            })[c],
        );
      }
      function render() {
        let total = items.reduce((a, i) => a + i.qty, 0),
          low = items.filter((i) => status(i) === "low").length,
          out = items.filter((i) => status(i) === "out").length;
        document.getElementById("totalQty").textContent = fmt(total);
        document.getElementById("itemCount").textContent = items.length;
        document.getElementById("lowQty").textContent = low;
        document.getElementById("outQty").textContent = out;
        document.getElementById("donutTotal").textContent = fmt(total);
        let issued = tx
          .filter((t) => t.dateKey === today.toDateString())
          .reduce((a, t) => a + t.qty, 0);
        document.getElementById("issuedToday").textContent = issued;
        let categoryTotals = {};
        items.forEach(
          (i) =>
            (categoryTotals[i.category] =
              (categoryTotals[i.category] || 0) + i.qty),
        );
        let sorted = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
        let colors = [
          "#a61c1c",
          "#e85a1d",
          "#f2a65a",
          "#dfd4ce",
          "#c83c37",
          "#ed9b6c",
          "#8faaa0",
          "#bea494",
        ];
        let accum = 0,
          stops = [];
        sorted.forEach(([c, n], i) => {
          let from = total ? (accum / total) * 100 : 0;
          accum += n;
          stops.push(
            `${colors[i % colors.length]} ${from}% ${total ? (accum / total) * 100 : from}%`,
          );
        });
        document.getElementById("donut").style.background =
          `conic-gradient(${stops.join(",")})`;
        document.getElementById("legend").innerHTML = sorted
          .slice(0, 5)
          .map(
            ([c, n], i) =>
              `<div class="legend-row"><i class="swatch" style="background:${colors[i % colors.length]}"></i>${esc(c)}<b>${total ? Math.round((n / total) * 100) : 0}%</b></div>`,
          )
          .join("");
        renderTrend();
        renderRows();
        renderTransactions();
        renderReports();
        renderAlerts();
        updateIssueSelect();
        renderProfile();
      }
      function renderAlerts() {
        let alerts = items.filter((i) => status(i) !== "in"),
          list = document.getElementById("alertList");
        if (!list) return;
        document.querySelector(".inventory-section-head b").textContent = alerts.length
          ? `Stock alerts · ${alerts.length} item${alerts.length === 1 ? "" : "s"}`
          : "Stock alerts · All clear";
        list.innerHTML = alerts.length
          ? alerts
              .map(
                (i) =>
                  `<button class="alert-entry" onclick="openAlertItem('${i.id}')"><span class="alert-mark ${status(i) === "out" ? "out" : ""}">${status(i) === "out" ? "!" : "↓"}</span><span><b>${status(i) === "out" ? "Out of stock" : "Low stock"}: ${esc(i.name)}</b><small>${status(i) === "out" ? "Restock required" : `${i.qty} left · reorder at ${i.threshold}`}</small></span></button>`,
              )
              .join("")
          : `<div class="alert-empty">No low or out-of-stock items right now. ✨</div>`;
      }
      function toggleAlerts(e) {
        e.stopPropagation();
        let p = document.getElementById("alertPanel"),
          open = !p.classList.contains("open");
        p.classList.toggle("open", open);
        document
          .querySelector('[aria-label="Notifications"]')
          .setAttribute("aria-expanded", String(open));
        if(open)loadNotifications();
      }
      async function loadNotifications({silent=false}={}) {
        if(notificationBusy||!document.getElementById("appRoot")||document.getElementById("appRoot").style.display==="none")return;
        notificationBusy=true;
        try { const result=await api("/api/notifications");notifications=result.items||[];unreadNotificationCount=result.unreadCount||0;renderNotificationFeed(); }
        catch(error){if(!silent)toast(error.message);}
        finally{notificationBusy=false;}
      }
      function renderNotificationFeed(){
        const badge=document.getElementById("notificationBadge"),feed=document.getElementById("notificationFeed"),mark=document.getElementById("markAllNotifications");
        badge.textContent=unreadNotificationCount>99?"99+":String(unreadNotificationCount);badge.style.display=unreadNotificationCount?"grid":"none";badge.setAttribute("aria-label",`${unreadNotificationCount} unread notifications`);
        document.getElementById("alertCount").textContent=unreadNotificationCount?`${unreadNotificationCount} unread`:"Up to date";mark.style.display=unreadNotificationCount?"inline-flex":"none";
        if(!notifications.length){feed.innerHTML='<div class="alert-empty">No recent activity yet.</div>';return;}
        const symbols={inventory:"▤",issue:"↗",support:"?",requisition:"▣",account:"●",activity:"•"};
        feed.innerHTML=notifications.map(n=>`<button type="button" class="notification-entry ${n.readAt?"":"unread"}" data-notification-id="${n.id}" data-section="${esc(n.section)}"><span class="notification-kind ${esc(n.kind)}">${symbols[n.kind]||"•"}</span><span class="notification-copy"><b>${esc(n.title)}</b><small>${esc(n.message)}</small><time>${new Date(n.createdAt).toLocaleString("en-IN",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</time></span>${n.readAt?"":'<i class="notification-unread-dot"></i>'}</button>`).join("");
      }
      async function markAllNotifications(){try{await api("/api/notifications",{method:"PATCH",body:JSON.stringify({all:true})});await loadNotifications({silent:true});}catch(error){toast(error.message);}}
      async function openNotification(id,section){try{await api("/api/notifications",{method:"PATCH",body:JSON.stringify({ids:[Number(id)]})});await loadNotifications({silent:true});document.getElementById("alertPanel").classList.remove("open");document.querySelector('[aria-label="Notifications"]').setAttribute("aria-expanded","false");const allowed=["dashboard","inventory","transactions","requisitions","support","reports"];const button=document.querySelector(`.nav button[data-page="${allowed.includes(section)?section:"dashboard"}"]`);button?.click();}catch(error){toast(error.message);}}
      function startNotificationPolling(){if(notificationTimer)clearInterval(notificationTimer);loadNotifications({silent:true});notificationTimer=setInterval(()=>loadNotifications({silent:true}),12000);}
      document.getElementById("notificationFeed").addEventListener("click",event=>{const button=event.target.closest("[data-notification-id]");if(button)openNotification(button.dataset.notificationId,button.dataset.section);});
      function openAlertItem(id) {
        let item = items.find((i) => i.id === id);
        if (!item) return;
        document.getElementById("alertPanel").classList.remove("open");
        document.querySelector('[data-page="inventory"]').click();
        document.getElementById("search").value = item.name;
        document.getElementById("categoryFilter").value = "";
        document.getElementById("statusFilter").value = status(item);
        renderRows();
      }
      document.addEventListener("click",e=>{if(window.matchMedia("(max-width: 820px)").matches&&document.getElementById("sidebar").classList.contains("open")&&!e.target.closest("#sidebar")&&!e.target.closest(".mobile-menu"))document.getElementById("sidebar").classList.remove("open");});
      document.addEventListener("click", (e) => {
        if (!e.target.closest(".notification-wrap")) {
          document.getElementById("alertPanel")?.classList.remove("open");
          document
            .querySelector('[aria-label="Notifications"]')
            ?.setAttribute("aria-expanded", "false");
        }
      });
      function renderTrend() {
        let days = 7,
          start = new Date();
        start.setDate(start.getDate() - 6);
        let labels = [],
          vals = [];
        for (let n = 0; n < days; n++) {
          let d = new Date(start);
          d.setDate(d.getDate() + n);
          labels.push(d.toLocaleDateString("en", { weekday: "short" }));
          vals.push(
            tx
              .filter(
                (t) => new Date(t.when).toDateString() === d.toDateString(),
              )
              .reduce((a, t) => a + t.qty, 0),
          );
        }
        let max = Math.max(8, ...vals),
          points = vals
            .map(
              (v, i) =>
                `${20 + (i * 440) / (days - 1)},${130 - (v / max) * 100}`,
            )
            .join(" ");
        document.getElementById("trendChart").innerHTML =
          `<defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#e85a1d" stop-opacity=".17"/><stop offset="1" stop-color="#e85a1d" stop-opacity="0"/></linearGradient></defs><path d="M${points.replaceAll(" ", " L")} L460 145 L20 145Z" fill="url(#area)"/><path d="M${points.replaceAll(" ", " L")}" fill="none" stroke="#c94736" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${vals.map((v, i) => `<circle cx="${20 + (i * 440) / (days - 1)}" cy="${130 - (v / max) * 100}" r="3.5" fill="white" stroke="#c94736" stroke-width="2"/>`).join("")}<path d="M20 145H460M20 95H460M20 45H460" stroke="#eee" stroke-dasharray="3 5"/>`;
        document.getElementById("trendLabels").innerHTML = labels
          .map((x) => `<span>${x}</span>`)
          .join("");
      }
      function renderRows() {
        let q = (document.getElementById("search")?.value || "").toLowerCase(),
          cat = document.getElementById("categoryFilter")?.value || "",
          st = document.getElementById("statusFilter")?.value || "";
        let a = items.filter(
          (i) =>
            (!q ||
              `${i.name} ${i.brand} ${i.id} ${i.category}`
                .toLowerCase()
                .includes(q)) &&
            (!cat || i.category === cat) &&
            (!st || status(i) === st),
        );
        if (sortDesc) a = a.slice().sort((x, y) => y.qty - x.qty);
        let html = a
          .map(
            (i) =>
              `<tr class="${status(i) === "low" ? "low-row" : status(i) === "out" ? "out-row" : ""}"><td class="id">${esc(i.id)}</td><td><div class="item-cell"><span class="item-icon">${esc(itemIcon(i))}</span><div><div class="item-name">${esc(i.name)}</div><div class="item-brand">${esc(displayBrand(i.brand))}</div></div></div></td><td>${esc(i.category)}</td><td class="qty">${fmt(i.qty)} <span class="unit">units</span></td><td>₹${fmt(i.price)}</td><td>${fmt(i.threshold)} units</td><td><span class="badge ${status(i)}">${status(i) === "in" ? "In stock" : status(i) === "low" ? "Low stock" : "Out of stock"}</span></td><td>${canManage()?`<div class="actions"><button class="act" title="Edit" onclick="editItem('${i.id}')">✎</button><button class="act" title="Issue" onclick="quickIssue('${i.id}')">↗</button><button class="act" title="Delete" onclick="deleteItem('${i.id}')">⌫</button></div>`:"Read only"}</td></tr>`,
          )
          .join("");
        document.getElementById("inventoryRows").innerHTML =
          html ||
          '<tr><td colspan="8" style="text-align:center;padding:32px;color:#999">No items match your search.</td></tr>';
        document.getElementById("rowCount").textContent =
          `Showing ${a.length} of ${items.length} items`;
        let opts = [...new Set(items.map((i) => i.category))].sort();
        let filter = document.getElementById("categoryFilter");
        let old = filter.value;
        filter.innerHTML =
          '<option value="">All categories</option>' +
          opts.map((c) => `<option>${esc(c)}</option>`).join("");
        filter.value = old;
        let mount = document.getElementById("inventoryMount");
        if (mount)
          mount.innerHTML = `<div class="card table-card"><div class="table-scroll"><table><thead><tr><th>Item ID</th><th>Item</th><th>Category</th><th>Available qty</th><th>Unit price</th><th>Reorder at</th><th>Status</th><th>Actions</th></tr></thead><tbody>${html}</tbody></table></div><div class="table-foot">Showing ${a.length} of ${items.length} items</div></div>`;
      }
      function renderTransactions() {
        const history = tx.map(t=>`<div class="txn"><div><b>${esc(t.name)}</b><small>${esc(t.detail)}</small></div><span class="issued">−${t.qty} units</span><button class="secondary slip-btn" onclick="printIssueSlip(${t.id})">Print slip</button></div>`).join("") || '<p style="font-size:11px;color:#999">No transactions recorded yet.</p>';
        const recent = tx.slice(0,10).map(t=>`<div class="txn"><div><b>${esc(t.name)}</b><small>${esc(t.detail)}</small></div><span class="issued">−${t.qty} units</span></div>`).join("") || '<p style="font-size:11px;color:#999">No transactions recorded yet.</p>';
        document.getElementById("transactionsList").innerHTML = history;
        document.getElementById("reportTxns").innerHTML = recent;
        updateRequestItemSelect();
      }
      function renderReports() {
        let total = items.reduce((a, i) => a + i.qty, 0);
        document.getElementById("reportStats").innerHTML =
          `<div class="card stat"><div class="stat-label">Total stock units</div><div class="stat-value">${fmt(total)}</div></div><div class="card stat"><div class="stat-label">Catalog items</div><div class="stat-value">${items.length}</div></div><div class="card stat"><div class="stat-label">Low stock items</div><div class="stat-value">${items.filter((i) => status(i) === "low").length}</div></div><div class="card stat"><div class="stat-label">Out of stock</div><div class="stat-value">${items.filter((i) => status(i) === "out").length}</div></div>`;
        let sums = {};
        items.forEach(
          (i) => (sums[i.category] = (sums[i.category] || 0) + i.qty),
        );
        document.getElementById("reportCategories").innerHTML = Object.entries(
          sums,
        )
          .sort((a, b) => b[1] - a[1])
          .map(
            ([c, n]) =>
              `<div style="margin:13px 0"><div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:6px"><span>${esc(c)}</span><b>${fmt(n)}</b></div><div style="height:6px;background:#f2f2f4;border-radius:8px"><div style="height:100%;width:${total ? (n / total) * 100 : 0}%;background:linear-gradient(90deg,#a61c1c,#e85a1d);border-radius:8px"></div></div></div>`,
          )
          .join("");
      }
      function updateIssueSelect() {
        let s = document.getElementById("issueItem");
        if (!s) return;
        let old = s.value;
        s.innerHTML = items
          .filter((i) => i.qty > 0)
          .map(
            (i) =>
              `<option value="${esc(i.id)}">${esc(i.name)} · ${i.qty} available</option>`,
          )
          .join("");
        if (old) s.value = old;
      }
      function openModal(id) {
        let i = items.find((x) => x.id === id),
          form = document.getElementById("itemForm");
        form.dataset.edit = id || "";
        document.getElementById("modalTitle").textContent = i
          ? "Edit inventory item"
          : "Add new item";
        document.getElementById("modalFields").innerHTML = fields(i);
        document.getElementById("modalBack").classList.add("open");
      }
      function closeModal() {
        document.getElementById("modalBack").classList.remove("open");
      }
      function fields(i) {
        return `<div class="field"><label>Item name</label><input name="name" required placeholder="e.g. Ruled notebook" value="${esc(i?.name || "")}"></div><div class="field"><label>Brand / model</label><input name="brand" placeholder="Brand & product details" value="${esc(i?.brand || "")}"></div><div class="field"><label>Category</label><select name="category" required>${cats.map((c) => `<option ${i?.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div><div class="field"><label>Quantity received</label><input name="qty" type="number" min="0" required value="${i?.qty ?? ""}" placeholder="0"></div><div class="field"><label>Unit cost / issue price (₹)</label><input name="price" type="number" min="0" step=".5" required value="${i?.price ?? ""}" placeholder="0.00"></div><div class="field"><label>Reorder level</label><input name="threshold" type="number" min="0" required value="${i?.threshold ?? 10}"></div><div class="field"><label>Vendor / supplier</label><input name="vendor" placeholder="Supplier name"></div><div class="field"><label>Date of entry</label><input name="date" type="date" value="${today.toISOString().slice(0, 10)}"></div>`;
      }
      function editItem(id) {
        openModal(id);
      }
      async function deleteItem(id) {
        let item=items.find(i=>i.id===id); if(!item)return;
        if(!confirm(`Delete ${item.name} from inventory?`))return;
        try { await api(`/api/items/${encodeURIComponent(id)}`,{method:"DELETE"}); await reloadData(); toast("Item removed from inventory."); }
        catch(error){toast(error.message);}
      }
      async function quickIssue(id) {
        let item=items.find(x=>x.id===id);if(!item||!item.qty){toast("This item is out of stock.");return;}
        let quantity=Number(prompt(`How many ${item.name} would you like to issue? (Available: ${item.qty})`,"1"));
        if(!Number.isInteger(quantity)||quantity<1||quantity>item.qty){toast("Enter a valid quantity within available stock.");return;}
        try { await api("/api/transactions",{method:"POST",body:JSON.stringify({itemId:id,quantity,person:"Store counter"})});await reloadData();toast(`${quantity} ${item.name} issued successfully.`); }
        catch(error){toast(error.message);}
      }
      function sortByQty() {
        sortDesc = !sortDesc;
        renderRows();
      }
      document.getElementById("itemForm").addEventListener("submit", async (e) => {
        e.preventDefault(); const form=e.currentTarget, f=new FormData(form), id=form.dataset.edit;
        const iconMap={Notebooks:"📓",Pens:"🖊️",Pencils:"✏️","Paper / Files":"📁","Office Supplies":"📄","Drawing Tools":"📐","Lab Manuals":"📗","Art & Craft":"🎨"};
        const payload={name:f.get("name").trim(),brand:f.get("brand")||"Quest Group",category:f.get("category"),qty:+f.get("qty"),price:+f.get("price"),threshold:+f.get("threshold"),vendor:f.get("vendor"),entryDate:f.get("date"),icon:items.find(i=>i.id===id)?.icon||iconMap[f.get("category")]||"📦"};
        try { await api(id?`/api/items/${encodeURIComponent(id)}`:"/api/items",{method:id?"PUT":"POST",body:JSON.stringify(payload)});await reloadData();closeModal();toast(id?"Inventory item updated.":"New item added to inventory."); }
        catch(error){toast(error.message);}
      });
      document.getElementById("addForm").innerHTML =
        `<div class="form-grid">${fields(null)}</div><div class="form-actions"><button class="primary" type="submit">Save item</button><button class="secondary" type="reset">Reset form</button></div>`;
      document.getElementById("addForm").addEventListener("submit", async (e) => {
        e.preventDefault();const form=e.currentTarget,f=new FormData(form),category=f.get("category");
        const icons={Notebooks:"📓",Pens:"🖊️",Pencils:"✏️","Paper / Files":"📁","Office Supplies":"📄","Drawing Tools":"📐","Lab Manuals":"📗","Art & Craft":"🎨"};
        const payload={name:f.get("name").trim(),brand:f.get("brand")||"Quest Group",category,qty:+f.get("qty"),price:+f.get("price"),threshold:+f.get("threshold"),vendor:f.get("vendor"),entryDate:f.get("date"),icon:icons[category]||"📦"};
        try{await api("/api/items",{method:"POST",body:JSON.stringify(payload)});await reloadData();form.reset();toast("New item added to inventory.");}
        catch(error){toast(error.message);}
      });
      document.getElementById("issueForm").addEventListener("submit", async (e) => {
        e.preventDefault();const form=e.currentTarget,f=new FormData(form),quantity=+f.get("quantity"),item=items.find(i=>i.id===f.get("item"));
        if(!item||quantity<1||quantity>item.qty){toast("Please check the available quantity.");return;}
        try{await api("/api/transactions",{method:"POST",body:JSON.stringify({itemId:item.id,quantity,person:f.get("person"),institution:f.get("institution")})});await reloadData();form.reset();form.elements.issuedBy.value=profile.name;toast(`${quantity} ${item.name} issued successfully.`);}
        catch(error){toast(error.message);}
      });
      ["search", "categoryFilter", "statusFilter"].forEach((id) =>
        document
          .getElementById(id)
          .addEventListener(id === "search" ? "input" : "change", renderRows),
      );
      document.querySelectorAll(".nav button").forEach((b) =>
        b.addEventListener("click", () => {
          document
            .querySelectorAll(".nav button")
            .forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          document
            .querySelectorAll(".section-view")
            .forEach((x) => x.classList.remove("active"));
          document
            .getElementById("page-" + b.dataset.page)
            .classList.add("active");
          document.getElementById("crumb").textContent = b.textContent.trim();
          document.getElementById("sidebar").classList.remove("open");
          if (b.dataset.page === "inventory") renderRows();
          if (b.dataset.page === "settings" && profile.role === "admin") loadStaffAccounts();
          if (b.dataset.page === "transactions") loadRequisitions();
          if (b.dataset.page === "support") loadSupportTickets();
          if (b.dataset.page === "requisitions") loadRequisitions();
          if (b.dataset.page === "reports") loadAnalytics();
        }),
      );
      async function loadStaffAccounts() {
        try { const accounts=await api("/api/users");const roleNames={admin:"Administrator",staff:"Store staff",viewer:"Read-only",department:"Department requester"};document.getElementById("staffAccounts").innerHTML=accounts.map(a=>`<div class="txn"><div><b>${esc(a.name)}</b><small>@${esc(a.username)} · ${esc(a.department||"No department")}</small></div><span class="badge ${a.role==="admin"?"low":"in"}">${roleNames[a.role]||esc(a.role)}</span></div>`).join(""); }
        catch(error){ toast(error.message); }
      }
      function openSupportModal() { document.getElementById("supportForm").reset(); document.getElementById("supportModal").classList.add("open"); }
      function closeSupportModal() { document.getElementById("supportModal").classList.remove("open"); }
      async function loadSupportTickets() {
        const list=document.getElementById("supportTickets"),admin=profile.role==="admin";
        document.getElementById("supportListTitle").textContent=admin?"All support requests":"My requests";
        document.getElementById("supportIntro").textContent=admin?"Review questions from store staff and reply or update their status.":"Send a question to the store administrator and follow its status.";
        list.innerHTML='<div class="support-empty">Loading requests…</div>';
        try {
          const tickets=await api("/api/support");
          if(!tickets.length){list.innerHTML='<div class="support-empty">No support requests yet.</div>';return;}
          list.innerHTML=tickets.map(ticket=>`<article class="support-ticket"><div class="support-ticket-head"><div><h4>${esc(ticket.subject)}</h4><div class="support-ticket-meta">${admin?`${esc(ticket.createdName)} · @${esc(ticket.createdUsername)} · `:""}${esc(ticket.category)} · ${new Date(ticket.createdAt).toLocaleString("en-IN")}</div></div><span class="badge ${ticket.status==="resolved"?"closed":"open"}">${ticket.status==="resolved"?"Resolved":"Open"}</span></div><p>${esc(ticket.message)}</p>${ticket.reply?`<div class="support-reply"><b>Store support reply</b><br>${esc(ticket.reply)}</div>`:""}${admin&&ticket.status==="open"?`<textarea id="support-reply-${ticket.id}" maxlength="5000" placeholder="Write a reply (optional)"></textarea><div class="actions-row"><button class="primary" type="button" onclick="resolveSupport(${ticket.id},true)">Reply &amp; resolve</button><button class="secondary" type="button" onclick="resolveSupport(${ticket.id},false)">Mark resolved</button></div>`:""}${admin&&ticket.status==="resolved"?`<div class="actions-row"><button class="secondary" type="button" onclick="setSupportStatus(${ticket.id},'open')">Reopen request</button></div>`:""}</article>`).join("");
        } catch(error){list.innerHTML=`<div class="support-empty">${esc(error.message)}</div>`;}
      }
      async function resolveSupport(id,includeReply) { const reply=includeReply?document.getElementById(`support-reply-${id}`).value:"";try{await api(`/api/support/${id}`,{method:"PATCH",body:JSON.stringify({status:"resolved",reply})});await loadSupportTickets();toast("Support request updated.");}catch(error){toast(error.message);} }
      async function setSupportStatus(id,status) { try{await api(`/api/support/${id}`,{method:"PATCH",body:JSON.stringify({status})});await loadSupportTickets();toast(status==="open"?"Request reopened.":"Request resolved.");}catch(error){toast(error.message);} }
      document.getElementById("supportForm").addEventListener("submit",async e=>{
        e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type="submit"]'),startedAt=Date.now();submit.disabled=true;
        const payload={subject:document.getElementById("supportSubject").value.trim(),category:document.getElementById("supportCategory").value,message:document.getElementById("supportMessage").value.trim()};
        try{await api("/api/support",{method:"POST",body:JSON.stringify(payload)});closeSupportModal();await loadSupportTickets();toast("Your support request was sent.");}
        catch(error){try{const existing=await api("/api/support"),saved=existing.some(t=>t.createdName===profile.name&&t.subject===payload.subject&&t.message===payload.message&&Date.parse(t.createdAt)>=startedAt-5000);if(saved){closeSupportModal();await loadSupportTickets();toast("Your support query was saved.");return;}}catch{}toast(error.message);}
        finally{submit.disabled=false;}
      });
      document.getElementById("staffForm").addEventListener("submit",async e=>{
        e.preventDefault();const form=e.currentTarget;
        const payload={name:document.getElementById("staffName").value.trim(),username:document.getElementById("staffUsername").value.trim(),password:document.getElementById("staffPassword").value,role:document.getElementById("staffRole").value,department:document.getElementById("staffDepartment").value.trim()};
        try{await api("/api/users",{method:"POST",body:JSON.stringify(payload)});form.reset();await loadStaffAccounts();toast("Account created.");}
        catch(error){toast(error.message);}
      });
      async function downloadReport(){
        try{const a=await api("/api/analytics"),table=(headers,rows)=>`<table border="1"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(v=>`<td>${esc(String(v??""))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
          const html=`<html><meta charset="utf-8"><body><h2>Quest Stationery Reports</h2><h3>Current inventory</h3>${table(["Item ID","Item","Brand","Category","Quantity","Unit price","Reorder level","Status"],items.map(i=>[i.id,i.name,i.brand,i.category,i.qty,i.price,i.threshold,status(i)]))}<h3>Monthly consumption and spending</h3>${table(["Month","Department / institution","Quantity","Spend (INR)"],a.monthly.map(r=>[r.month,r.institution,r.quantity,r.spending]))}<h3>Most-used items</h3>${table(["Item","Units issued"],a.top.map(r=>[r.itemName,r.quantity]))}<h3>Reorder suggestions (90-day usage)</h3>${table(["Item","Available","Average daily use","Days remaining","Suggested order","Order by (days)"],a.reorder.map(r=>[r.name,r.qty,r.avgDaily,r.estimatedDaysRemaining??"—",r.suggestedOrder,r.orderByDays??"No recent use"]))}</body></html>`;const link=document.createElement("a");link.href=URL.createObjectURL(new Blob([html],{type:"application/vnd.ms-excel;charset=utf-8"}));link.download="quest-stationery-reports.xls";link.click();URL.revokeObjectURL(link.href);toast("Excel report downloaded.");
        }catch(e){toast(e.message);}
      }
      function downloadReportCsv(){let rows=[["Item ID","Item","Brand","Category","Quantity","Unit Price","Reorder At","Status"],...items.map(i=>[i.id,i.name,i.brand,i.category,i.qty,i.price,i.threshold,status(i)])];let csv=rows.map(r=>r.map(x=>'"'+String(x).replaceAll('"','""')+'"').join(",")).join("\r\n"),a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="quest-stationery-inventory.csv";a.click();URL.revokeObjectURL(a.href);toast("Inventory CSV downloaded.");}
      async function loadRequisitions() {
        const el=document.getElementById("requisitionList"); el.innerHTML='<div class="support-empty">Loading requests…</div>';
        try { const list=await api("/api/requisitions"),admin=profile.role==="admin";
          if(!list.length){el.innerHTML='<div class="support-empty">No requisitions yet.</div>';return;}
          el.innerHTML=list.map(r=>`<article class="support-ticket"><div class="support-ticket-head"><div><h4>${esc(r.itemName)} · ${fmt(r.quantity)} units</h4><div class="support-ticket-meta">${esc(r.department)} · Requested by ${esc(r.requesterName)} · ${new Date(r.createdAt).toLocaleString("en-IN")}</div></div><span class="badge ${r.status==='approved'?'in':r.status==='rejected'?'closed':'open'}">${esc(r.status)}</span></div><p>${esc(r.purpose||'No purpose provided.')}</p>${r.decidedBy?`<div class="support-ticket-meta">${r.status==='approved'?'Issued':'Reviewed'} by ${esc(r.decidedBy)}${r.transactionId?` · Slip available in issue history`:''}</div>`:''}${admin&&r.status==='pending'?`<div class="actions-row"><button class="primary" onclick="decideRequisition(${r.id},'approve')">Approve &amp; issue</button><button class="secondary" onclick="decideRequisition(${r.id},'reject')">Reject</button></div>`:''}</article>`).join("");
        }catch(e){el.innerHTML=`<div class="support-empty">${esc(e.message)}</div>`;}
      }
      function updateRequestItemSelect(){const sel=document.getElementById("requestItem");if(!sel)return;const old=sel.value;sel.innerHTML=items.map(i=>`<option value="${esc(i.id)}">${esc(i.name)} · ${i.qty} available</option>`).join("");if(old)sel.value=old;}
      document.getElementById("requisitionForm").addEventListener("submit",async e=>{
        e.preventDefault();const form=e.currentTarget,submit=form.querySelector('button[type="submit"]'),startedAt=Date.now();
        const payload={department:document.getElementById("requestDepartment").value.trim(),itemId:document.getElementById("requestItem").value,quantity:+document.getElementById("requestQuantity").value,purpose:document.getElementById("requestPurpose").value.trim()};
        submit.disabled=true;
        try{await api("/api/requisitions",{method:"POST",body:JSON.stringify(payload)});form.reset();document.getElementById("requestDepartment").value=profile.department||"";await loadRequisitions();toast("Requisition sent for approval.");}
        catch(error){try{const existing=await api("/api/requisitions"),saved=existing.some(r=>r.requesterName===profile.name&&r.department===payload.department&&r.itemId===payload.itemId&&r.quantity===payload.quantity&&r.purpose===payload.purpose&&Date.parse(r.createdAt)>=startedAt-5000);if(saved){form.reset();document.getElementById("requestDepartment").value=profile.department||"";await loadRequisitions();toast("Your requisition was saved.");return;}}catch{}toast(error.message);}
        finally{submit.disabled=false;}
      });
      async function decideRequisition(id,action){try{await api(`/api/requisitions/${id}/${action}`,{method:"POST",body:"{}"});await reloadData();await loadRequisitions();toast(action==='approve'?"Request approved and items issued.":"Request rejected.");}catch(e){toast(e.message);}}
      function printIssueSlip(id){const t=tx.find(x=>x.id===id);if(!t){toast("Issue record not found.");return;}const w=window.open("","_blank","width=800,height=900");if(!w){toast("Allow pop-ups to print the issue slip.");return;}w.document.write(`<!doctype html><html><head><title>Quest Issue Slip #${t.id}</title><style>body{font:14px Arial,sans-serif;color:#222;margin:38px}.head{display:flex;align-items:center;gap:20px;border-bottom:2px solid #a61c1c;padding-bottom:16px}.head img{width:150px}.id{margin-left:auto;color:#777}h1{font-size:21px;margin:8px 0}.meta{line-height:2;margin:22px 0}.items{width:100%;border-collapse:collapse}.items th,.items td{border:1px solid #bbb;padding:12px;text-align:left}.sign{display:flex;justify-content:space-between;margin-top:100px}.sign div{border-top:1px solid #444;width:38%;padding-top:8px}.foot{color:#777;font-size:11px;margin-top:26px}@media print{body{margin:15mm}}</style></head><body><div class="head"><img src="${location.origin}/quest-logo.webp"><div><h1>Stationery Issue Slip</h1>Quest Group of Institutions</div><span class="id">Slip #${t.id}</span></div><div class="meta"><b>Issued to / Department:</b> ${esc(t.person)}<br><b>Issued by:</b> ${esc(t.issuedBy)}<br><b>Date &amp; time:</b> ${new Date(t.when).toLocaleString("en-IN")}</div><table class="items"><thead><tr><th>Item</th><th>Item ID</th><th>Quantity issued</th></tr></thead><tbody><tr><td>${esc(t.name)}</td><td>${esc(t.itemId||"—")}</td><td>${fmt(t.qty)}</td></tr></tbody></table><div class="sign"><div>Receiver signature &amp; name</div><div>Store keeper signature</div></div><div class="foot">Generated from Quest Stationery Store Portal for audit records.</div><script>window.onload=()=>{setTimeout(()=>window.print(),300)}</script></body></html>`);w.document.close();}
      async function loadAnalytics(){try{const a=await api("/api/analytics");const monthlyTotals={};a.monthly.forEach(r=>monthlyTotals[r.month]=(monthlyTotals[r.month]||0)+r.quantity);const months=Object.entries(monthlyTotals).sort((x,y)=>x[0].localeCompare(y[0])).slice(-6),peak=Math.max(1,...months.map(x=>x[1]));document.getElementById("monthlyTrendChart").innerHTML=months.map(([month,total])=>`<div class="month-bar-wrap"><div class="month-bar-value">${fmt(total)}</div><div class="month-bar" style="height:${Math.max(5,total/peak*100)}%" title="${fmt(total)} units"></div><small>${esc(month)}</small></div>`).join("")||'<span class="support-empty">Monthly usage will appear as issue records are added.</span>';document.getElementById("monthlyReportRows").innerHTML=a.monthly.map(r=>`<tr><td>${esc(r.month)}</td><td>${esc(r.institution)}</td><td>${fmt(r.quantity)}</td><td>₹${fmt(Math.round(r.spending||0))}</td></tr>`).join("")||'<tr><td colspan="4">No issue history available.</td></tr>';document.getElementById("topItemsReport").innerHTML=a.top.map((r,n)=>`<div class="txn"><div><b>${n+1}. ${esc(r.itemName)}</b><small>Most-used items</small></div><span class="issued">${fmt(r.quantity)} units</span></div>`).join("")||'<p class="support-empty">No issues recorded yet.</p>';document.getElementById("reorderRows").innerHTML=a.reorder.map(r=>`<tr><td>${esc(r.name)}</td><td>${fmt(r.qty)}</td><td>${r.avgDaily}</td><td>${r.estimatedDaysRemaining===null?'—':fmt(r.estimatedDaysRemaining)}</td><td><b>${fmt(r.suggestedOrder)}</b></td><td>${r.orderByDays===null?'No recent use':r.orderByDays===0?'Now':`In ${fmt(r.orderByDays)} days`}</td></tr>`).join("");document.getElementById("analyticsStats").innerHTML=`<div class="card stat"><div class="stat-label">Issue records analyzed</div><div class="stat-value">${tx.length}</div></div><div class="card stat"><div class="stat-label">Items with usage</div><div class="stat-value">${a.reorder.filter(r=>r.avgDaily>0).length}</div></div><div class="card stat"><div class="stat-label">Suggested to reorder</div><div class="stat-value">${a.reorder.filter(r=>r.suggestedOrder>0).length}</div></div><div class="card stat"><div class="stat-label">Usage window</div><div class="stat-value">90 days</div></div>`;}catch(e){toast(e.message);}}
      async function resetDemo() {
        if(!confirm("Restore the original sample inventory? This replaces inventory and transaction data in the database."))return;
        try{await api("/api/demo/reset",{method:"POST",body:"{}"});await reloadData();toast("Sample inventory restored.");}
        catch(error){toast(error.message);}
      }
      function closeModalKey(e) {
        if (e.key === "Escape") { closeModal(); document.getElementById("sidebar").classList.remove("open"); }
      }
      document.addEventListener("keydown", closeModalKey);
      initializeApp();


