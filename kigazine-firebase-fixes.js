// Kigazine Firebase + UI fixes
// Add this file with:
// <script type="module" src="./kigazine-firebase-fixes.js"></script>
// It expects Firebase Auth + Firestore to be available through your existing Firebase config.

import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

const state = {
  currentPage: "home",
  user: null
};

const ACTIVE_CLASSES = [
  "active",
  "pressed",
  "selected",
  "current",
  "is-active",
  "nav-active"
];

const SIDEBAR_SELECTOR = ".sidebar, aside, nav, [data-sidebar]";
const NAV_ITEM_SELECTOR = "button, a, [role='button'], [data-nav], [data-page-target]";

onAuthStateChanged(auth, user => {
  state.user = user;
  document.body.dataset.auth = user ? "signed-in" : "signed-out";
});

function getPageNameFromElement(el) {
  if (!el) return "";

  return (
    el.dataset.nav ||
    el.dataset.pageTarget ||
    el.dataset.page ||
    el.getAttribute("data-section") ||
    el.getAttribute("aria-controls") ||
    ""
  ).trim();
}

function normalizePageName(pageName) {
  return String(pageName || "")
    .replace(/^#/, "")
    .replace(/Page$/, "")
    .trim()
    .toLowerCase();
}

function removeVisualState(el) {
  ACTIVE_CLASSES.forEach(className => el.classList.remove(className));
  el.removeAttribute("aria-current");
  el.removeAttribute("data-active");

  if (typeof el.blur === "function") el.blur();
}

function addVisualState(el) {
  el.classList.add("active");
  el.setAttribute("aria-current", "page");
  el.dataset.active = "true";
}

export function clearButtonPressState() {
  document.querySelectorAll("button, a, [role='button'], .pressed, .active").forEach(el => {
    if (!el.closest(SIDEBAR_SELECTOR)) {
      el.classList.remove("pressed", "selected", "current", "is-active", "nav-active");
      if (typeof el.blur === "function") el.blur();
    }
  });

  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
}

export function setSidebarActive(pageName, clickedElement = null) {
  const targetName = normalizePageName(pageName);
  const sidebarItems = document.querySelectorAll(`${SIDEBAR_SELECTOR} ${NAV_ITEM_SELECTOR}`);

  sidebarItems.forEach(item => {
    removeVisualState(item);
  });

  let activeItem = clickedElement?.closest?.(`${SIDEBAR_SELECTOR} ${NAV_ITEM_SELECTOR}`) || null;

  if (!activeItem && targetName) {
    activeItem = Array.from(sidebarItems).find(item => {
      const itemPage = normalizePageName(getPageNameFromElement(item));
      const hrefPage = normalizePageName(item.getAttribute("href") || "");
      const textPage = normalizePageName(item.textContent || "");
      return itemPage === targetName || hrefPage === targetName || textPage.includes(targetName);
    }) || null;
  }

  if (activeItem) addVisualState(activeItem);
  clearButtonPressState();
}

export function setActivePage(pageName, clickedElement = null) {
  state.currentPage = pageName;
  const normalized = normalizePageName(pageName);

  document.querySelectorAll("[data-page]").forEach(page => {
    const pageKey = normalizePageName(page.dataset.page || page.id);
    const active = pageKey === normalized;
    page.hidden = !active;
    page.classList.toggle("active-page", active);
  });

  setSidebarActive(pageName, clickedElement);
}

export function installNavLogic() {
  document.addEventListener("click", event => {
    const navItem = event.target.closest(`${SIDEBAR_SELECTOR} ${NAV_ITEM_SELECTOR}`);
    if (!navItem) return;

    const pageName = getPageNameFromElement(navItem);

    // Critical fix: remove stuck states immediately before any plugin/router code runs.
    setSidebarActive(pageName, navItem);

    if (pageName) {
      state.currentPage = pageName;
      window.requestAnimationFrame(() => setSidebarActive(pageName, navItem));
      window.setTimeout(() => setSidebarActive(pageName, navItem), 0);
    }
  }, true);

  document.querySelectorAll("[data-nav], [data-page-target]").forEach(button => {
    button.addEventListener("click", event => {
      const pageName = getPageNameFromElement(button);
      if (pageName) setActivePage(pageName, event.currentTarget);
    });
  });

  document.addEventListener("pointerup", clearButtonPressState);
  document.addEventListener("keyup", event => {
    if (event.key === "Escape") clearButtonPressState();
  });

  const initial = document.querySelector(`${SIDEBAR_SELECTOR} .active, ${SIDEBAR_SELECTOR} [aria-current='page']`);
  if (initial) {
    setSidebarActive(getPageNameFromElement(initial), initial);
  }
}

function requireUser() {
  if (!state.user) {
    throw new Error("You must be signed in first.");
  }
  return state.user;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showFirestoreError(container, error, label) {
  console.error(`${label} Firestore error:`, error);

  if (!container) return;

  const reason = error?.code === "permission-denied"
    ? "Missing or insufficient Firestore permissions. Publish the new firestore.rules file in Firebase Console."
    : error?.message || "Unknown Firestore error.";

  container.innerHTML = `
    <div class="firestore-error">
      <strong>${escapeHtml(label)} Firestore error</strong>
      <p>${escapeHtml(reason)}</p>
    </div>
  `;
}

async function readCollection(collectionName, containerId, renderer, label) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = "Loading...";

  try {
    const snapshot = await getDocs(
      query(collection(db, collectionName), orderBy("createdAt", "desc"))
    );

    if (snapshot.empty) {
      container.innerHTML = `<p>No ${escapeHtml(label.toLowerCase())} yet.</p>`;
      return;
    }

    container.innerHTML = snapshot.docs
      .map(doc => renderer({ id: doc.id, ...doc.data() }))
      .join("");
  } catch (error) {
    showFirestoreError(container, error, label);
  }
}

export async function loadMessages(containerId = "messagesList") {
  return readCollection(
    "messages",
    containerId,
    msg => `
      <article class="message-card" data-id="${escapeHtml(msg.id)}">
        <p>${escapeHtml(msg.text || msg.content || "")}</p>
        <small>by ${escapeHtml(msg.authorName || "Anonymous")}</small>
      </article>
    `,
    "Messages"
  );
}

export async function sendMessage(text) {
  const user = requireUser();
  const cleanText = String(text || "").trim();

  if (!cleanText) throw new Error("Message is empty.");

  await addDoc(collection(db, "messages"), {
    text: cleanText,
    authorUid: user.uid,
    authorName: user.displayName || user.email || "Anonymous",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function loadGroups(containerId = "groupsList") {
  return readCollection(
    "groups",
    containerId,
    group => `
      <article class="group-card" data-id="${escapeHtml(group.id)}">
        <h3>${escapeHtml(group.name || "Untitled group")}</h3>
        <p>${escapeHtml(group.description || "")}</p>
        <small>owner: ${escapeHtml(group.ownerName || "Unknown")}</small>
      </article>
    `,
    "Groups"
  );
}

export async function createGroup({ name, description = "" }) {
  const user = requireUser();
  const cleanName = String(name || "").trim();

  if (!cleanName) throw new Error("Group name is empty.");

  await addDoc(collection(db, "groups"), {
    name: cleanName,
    description: String(description || "").trim(),
    ownerUid: user.uid,
    ownerName: user.displayName || user.email || "Anonymous",
    membersCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function loadKigazineHQ(containerId = "hqList") {
  const possibleCollections = ["hq", "kigazineHQ", "hqMessages"];
  const container = document.getElementById(containerId);
  if (!container) return;

  for (const collectionName of possibleCollections) {
    try {
      const snapshot = await getDocs(
        query(collection(db, collectionName), orderBy("createdAt", "desc"))
      );

      if (!snapshot.empty) {
        container.innerHTML = snapshot.docs.map(doc => {
          const post = { id: doc.id, ...doc.data() };
          return `
            <article class="hq-card" data-id="${escapeHtml(post.id)}">
              <h3>${escapeHtml(post.title || "Kigazine HQ")}</h3>
              <p>${escapeHtml(post.content || post.text || "")}</p>
              <small>by ${escapeHtml(post.authorName || "Kigazine")}</small>
            </article>
          `;
        }).join("");
        return;
      }
    } catch (error) {
      showFirestoreError(container, error, "Kigazine HQ");
      return;
    }
  }

  container.innerHTML = "<p>No Kigazine HQ posts yet.</p>";
}

export async function createHQPost({ title, content }) {
  const user = requireUser();
  const cleanTitle = String(title || "").trim();
  const cleanContent = String(content || "").trim();

  if (!cleanTitle || !cleanContent) {
    throw new Error("HQ title and content are required.");
  }

  await addDoc(collection(db, "hq"), {
    title: cleanTitle,
    content: cleanContent,
    authorUid: user.uid,
    authorName: user.displayName || user.email || "Anonymous",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

window.KigazineFixes = {
  setActivePage,
  setSidebarActive,
  installNavLogic,
  clearButtonPressState,
  loadMessages,
  sendMessage,
  loadGroups,
  createGroup,
  loadKigazineHQ,
  createHQPost
};

installNavLogic();
