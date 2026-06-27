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

onAuthStateChanged(auth, user => {
  state.user = user;
  document.body.dataset.auth = user ? "signed-in" : "signed-out";
});

export function setActivePage(pageName) {
  state.currentPage = pageName;

  document.querySelectorAll("[data-page]").forEach(page => {
    page.hidden = page.dataset.page !== pageName;
    page.classList.toggle("active-page", page.dataset.page === pageName);
  });

  document.querySelectorAll("[data-nav]").forEach(button => {
    const active = button.dataset.nav === pageName;
    button.classList.toggle("active", active);
    button.classList.toggle("pressed", false);
    button.setAttribute("aria-current", active ? "page" : "false");
  });

  clearButtonPressState();
}

export function installNavLogic() {
  document.querySelectorAll("[data-nav]").forEach(button => {
    button.addEventListener("click", () => setActivePage(button.dataset.nav));
  });

  document.addEventListener("pointerup", clearButtonPressState);
  document.addEventListener("keyup", event => {
    if (event.key === "Escape") clearButtonPressState();
  });

  setActivePage(state.currentPage);
}

export function clearButtonPressState() {
  document.querySelectorAll("button.pressed, .pressed").forEach(el => {
    el.classList.remove("pressed");
  });

  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
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
