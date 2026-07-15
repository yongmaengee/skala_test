// 방향 규칙: 오른쪽 스와이프 = 긍정 액션(입력줄→추가 / 할일→완료),
// 왼쪽 스와이프 = 보류. 왼쪽 서브윈도우(보류)·오른쪽 서브윈도우(완료)와 방향을 맞췄다.

const REVEAL = 76;   // 이만큼 끌면 버튼이 완전히 드러나며 "열림" 상태로 스냅
const COMMIT = 150;  // 이만큼 끌고 놓으면 버튼을 누르지 않아도 바로 확정
const DRAG_INTENT = 8; // 이 거리 이상 "가로로" 움직여야 스와이프로 인정 (탭/타이핑과 구분)

const todoList = document.getElementById("todoList");
const holdList = document.getElementById("holdList");
const doneList = document.getElementById("doneList");
const holdEmptyHint = document.getElementById("holdEmptyHint");
const doneEmptyHint = document.getElementById("doneEmptyHint");
const inputRow = document.getElementById("inputRow");
const todoInput = document.getElementById("todoInput");

let openRow = null; // 현재 "열림" 상태(버튼 노출)로 스냅되어 있는 row
let uid = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function updateEmptyHints() {
  holdEmptyHint.style.display = holdList.children.length ? "none" : "block";
  doneEmptyHint.style.display = doneList.children.length ? "none" : "block";
}

function setActionVisibility(row, offsetX) {
  const left = row.querySelector(".swipe-action.left-edge");
  const right = row.querySelector(".swipe-action.right-edge");
  if (left) {
    const p = clamp(offsetX / REVEAL, 0, 1);
    left.style.opacity = p;
    left.style.transform = `scale(${0.8 + p * 0.2})`;
  }
  if (right) {
    const p = clamp(-offsetX / REVEAL, 0, 1);
    right.style.opacity = p;
    right.style.transform = `scale(${0.8 + p * 0.2})`;
  }
}

function closeRow(row, instant = false) {
  const content = row.querySelector(".swipe-content");
  content.style.transition = instant ? "none" : "transform .28s cubic-bezier(.22,1,.36,1)";
  content.style.transform = "translateX(0px)";
  setActionVisibility(row, 0);
  row.dataset.open = "";
  if (openRow === row) openRow = null;
}

// 가로 스와이프 엔진: 입력줄 / 할일 항목 둘 다 이걸로 동작한다.
function attachHorizontalSwipe(row, handlers) {
  const content = row.querySelector(".swipe-content");
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let base = 0;
  let dragging = false;
  let currentX = 0;

  function onMove(e) {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      // 세로 이동이 더 크면 스크롤 의도로 보고 스와이프를 시작하지 않는다.
      if (Math.abs(dx) < DRAG_INTENT || Math.abs(dx) < Math.abs(dy)) return;
      dragging = true;
      content.setPointerCapture(pointerId);
      content.style.transition = "none";
      if (openRow && openRow !== row) closeRow(openRow);
    }

    e.preventDefault();
    currentX = clamp(base + dx, -(COMMIT + 24), COMMIT + 24);
    content.style.transform = `translateX(${currentX}px)`;
    setActionVisibility(row, currentX);
  }

  function cleanup() {
    content.removeEventListener("pointermove", onMove);
    content.removeEventListener("pointerup", onUp);
    content.removeEventListener("pointercancel", onCancel);
  }

  function finishDrag() {
    content.style.transition = "transform .28s cubic-bezier(.22,1,.36,1)";

    if (currentX >= COMMIT) {
      row.dataset.open = "";
      handlers.onCommitRight();
    } else if (currentX <= -COMMIT) {
      row.dataset.open = "";
      handlers.onCommitLeft();
    } else if (currentX >= REVEAL) {
      row.dataset.open = "l";
      content.style.transform = `translateX(${REVEAL}px)`;
      setActionVisibility(row, REVEAL);
      openRow = row;
    } else if (currentX <= -REVEAL) {
      row.dataset.open = "r";
      content.style.transform = `translateX(${-REVEAL}px)`;
      setActionVisibility(row, -REVEAL);
      openRow = row;
    } else {
      closeRow(row);
    }
  }

  function onUp(e) {
    if (e.pointerId !== pointerId) return;
    cleanup();
    if (dragging) finishDrag();
  }

  function onCancel(e) {
    if (e.pointerId !== pointerId) return;
    cleanup();
    if (dragging) finishDrag();
  }

  content.addEventListener("pointerdown", (e) => {
    if (row.dataset.locked === "1") return;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    base = row.dataset.open === "l" ? REVEAL : row.dataset.open === "r" ? -REVEAL : 0;
    dragging = false;
    content.addEventListener("pointermove", onMove);
    content.addEventListener("pointerup", onUp);
    content.addEventListener("pointercancel", onCancel);
  });

  // 열린 상태에서 버튼을 바로 눌러도 확정되도록
  row.querySelectorAll(".swipe-action").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (row.dataset.locked === "1") return;
      row.dataset.open = "";
      if (btn.classList.contains("left-edge")) handlers.onCommitRight();
      else handlers.onCommitLeft();
    });
  });
}

// 항목을 부드럽게 접으면서 DOM에서 제거 (완료/보류 이동 공통으로 사용)
function collapseAndRemove(row, after) {
  const height = row.offsetHeight;
  row.style.height = `${height}px`;
  row.style.overflow = "hidden";
  row.offsetHeight; // 강제 리플로우: 트랜지션이 실제로 재생되도록
  row.style.transition = "height .2s ease, margin .2s ease, padding .2s ease";
  row.style.height = "0px";
  row.style.marginBottom = "0px";
  row.style.paddingTop = "0px";
  row.style.paddingBottom = "0px";
  row.addEventListener(
    "transitionend",
    () => {
      row.remove();
      after();
    },
    { once: true }
  );
}

function createTodoItem(text) {
  const li = document.createElement("li");
  li.className = "swipe-row todo-item pop-in";
  li.dataset.id = String(++uid);
  li.innerHTML = `
    <div class="swipe-action left-edge" data-action="done">완료</div>
    <div class="swipe-action right-edge" data-action="hold">보류</div>
    <div class="swipe-content"><span class="todo-text"></span></div>
  `;
  li.querySelector(".todo-text").textContent = text;

  attachHorizontalSwipe(li, {
    onCommitRight: () => completeTodoItem(li),
    onCommitLeft: () => holdTodoItem(li),
  });

  return li;
}

function completeTodoItem(li) {
  li.dataset.locked = "1";
  closeRow(li, true);
  const text = li.querySelector(".todo-text").textContent;
  li.classList.add("strike");
  setTimeout(() => {
    li.classList.add("flicker-out");
    setTimeout(() => {
      collapseAndRemove(li, () => addDoneItem(text));
    }, 420);
  }, 260);
}

function holdTodoItem(li) {
  li.dataset.locked = "1";
  closeRow(li, true);
  const text = li.querySelector(".todo-text").textContent;
  li.classList.add("to-hold");
  setTimeout(() => {
    collapseAndRemove(li, () => addHoldItem(text));
  }, 180);
}

function addDoneItem(text) {
  const li = document.createElement("li");
  li.className = "side-item enter";
  li.textContent = text;
  doneList.appendChild(li);
  updateEmptyHints();
}

function addHoldItem(text) {
  const li = document.createElement("li");
  li.className = "side-item enter";
  li.dataset.id = String(++uid);
  li.textContent = text;
  attachVerticalSwipe(li);
  holdList.appendChild(li);
  updateEmptyHints();
}

// 보류 목록: 위/아래 어느 방향으로 밀어도 쫀득하게 커졌다가 할일목록으로 복귀
function attachVerticalSwipe(li) {
  const RESTORE_THRESHOLD = 40;
  let pointerId = null;
  let startY = 0;
  let currentY = 0;
  let dragging = false;

  li.addEventListener("pointerdown", (e) => {
    pointerId = e.pointerId;
    startY = e.clientY;
    currentY = 0;
    dragging = true;
    li.style.transition = "none";
    li.setPointerCapture(pointerId);
  });

  li.addEventListener("pointermove", (e) => {
    if (!dragging || e.pointerId !== pointerId) return;
    currentY = e.clientY - startY;
    const progress = clamp(Math.abs(currentY) / RESTORE_THRESHOLD, 0, 1);
    const scale = 1 + progress * 0.14;
    li.style.transform = `translateY(${currentY}px) scale(${scale})`;
    li.style.opacity = String(1 - progress * 0.15);
  });

  function end(e) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    li.style.transition = "transform .2s ease, opacity .2s ease";

    if (Math.abs(currentY) > RESTORE_THRESHOLD) {
      const text = li.textContent;
      li.classList.add("restoring");
      li.addEventListener(
        "animationend",
        () => {
          li.remove();
          restoreToTodoList(text);
          updateEmptyHints();
        },
        { once: true }
      );
    } else {
      li.style.transform = "translateY(0) scale(1)";
      li.style.opacity = "1";
    }
  }

  li.addEventListener("pointerup", end);
  li.addEventListener("pointercancel", end);
}

function restoreToTodoList(text) {
  const li = createTodoItem(text);
  todoList.appendChild(li);
}

function commitAdd() {
  const value = todoInput.value.trim();
  if (!value) {
    closeRow(inputRow);
    return;
  }
  const li = createTodoItem(value);
  todoList.appendChild(li);
  todoInput.value = "";
  closeRow(inputRow, true);
}

function commitAddToHold() {
  const value = todoInput.value.trim();
  if (!value) {
    closeRow(inputRow);
    return;
  }
  addHoldItem(value);
  todoInput.value = "";
  closeRow(inputRow, true);
}

attachHorizontalSwipe(inputRow, {
  onCommitRight: commitAdd,
  onCommitLeft: commitAddToHold,
});

// 스와이프가 메인 조작 방식이지만, 키보드로 타이핑 중인 사용자를 위한 보조 수단
todoInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") commitAdd();
});

updateEmptyHints();
