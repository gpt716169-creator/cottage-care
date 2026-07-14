// Cottage Care - Core Client Application Logic

const apiBaseUrl = '/api';

// Состояние приложения
let state = {
  currentTab: 'cleaning',
  currentRole: 'supervisor', // 'supervisor' | 'maid'
  cottages: [],
  laundry: { stock: [], needsToday: {}, needsTomorrow: {} },
  requests: [],
  reports: { reviews: [], stats: { total_cleanings: 0, avg_score: 5.0 }, commonIssues: [] },
  purchases: [],
  selectedCottage: null,
  selectedRating: 5,
  requestSubtab: 'urgent',
  filterType: 'all',
  searchQuery: ''
};

// Инициализация Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  
  // Установка имени пользователя из Telegram
  const tgUser = tg.initDataUnsafe?.user;
  if (tgUser) {
    document.getElementById('user-name').innerText = `${tgUser.first_name} ${tgUser.last_name || ''}`.trim();
    if (tgUser.photo_url) {
      document.getElementById('user-avatar').src = tgUser.photo_url;
    }
  }
}

// При запуске страницы
document.addEventListener('DOMContentLoaded', () => {
  // Восстанавливаем роль из localStorage, если она была сохранена
  const savedRole = localStorage.getItem('cottage_care_role');
  if (savedRole) {
    state.currentRole = savedRole;
  }
  updateRoleUI();

  // Первичный запуск
  switchTab('cleaning');
  refreshData();

  // Автообновление каждые 15 секунд для имитации реального времени
  setInterval(refreshData, 15000);
});

// Переключение вкладок
function switchTab(tabId) {
  state.currentTab = tabId;
  
  // Скрываем все секции вкладок
  const sections = ['tab-cleaning', 'tab-laundry', 'tab-requests', 'tab-reports', 'tab-purchases', 'tab-map'];
  sections.forEach(s => {
    const el = document.getElementById(s);
    if (el) el.classList.add('hidden');
  });

  // Показываем активную
  const activeEl = document.getElementById(`tab-${tabId}`);
  if (activeEl) activeEl.classList.remove('hidden');

  // Обновляем заголовки
  const titles = {
    cleaning: 'План уборок',
    laundry: 'Учет белья',
    requests: 'Технические заявки',
    reports: 'Контроль качества',
    purchases: 'Закупки расходников',
    map: 'Карта территории'
  };
  document.getElementById('current-title').innerText = titles[tabId] || 'Cottage Care';

  // Обновляем активные пункты меню (Desktop)
  document.querySelectorAll('aside nav button').forEach(btn => {
    const btnTab = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
    if (btnTab === tabId) {
      btn.classList.add('tab-active-desktop', 'bg-primary-container', 'text-white');
      btn.classList.remove('text-on-surface-variant');
    } else {
      btn.classList.remove('tab-active-desktop', 'bg-primary-container', 'text-white');
      btn.classList.add('text-on-surface-variant');
    }
  });

  // Обновляем активные пункты меню (Mobile)
  document.querySelectorAll('nav[class*="md:hidden"] button').forEach(btn => {
    const btnTab = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
    if (btnTab === tabId) {
      btn.classList.add('tab-active-mobile');
      btn.classList.remove('text-on-surface-variant');
    } else {
      btn.classList.remove('tab-active-mobile');
      btn.classList.add('text-on-surface-variant');
    }
  });

  // При переключении обновляем соответствующие данные
  if (tabId === 'laundry') fetchLaundry();
  if (tabId === 'requests') fetchRequests();
  if (tabId === 'reports') fetchReports();
  if (tabId === 'purchases') fetchPurchases();
  if (tabId === 'map') updateMapStatus();
}

// Загрузка всех данных с сервера
async function refreshData() {
  await fetchCottages();
  if (state.currentTab === 'laundry') await fetchLaundry();
  if (state.currentTab === 'requests') await fetchRequests();
  if (state.currentTab === 'reports') await fetchReports();
  if (state.currentTab === 'purchases') await fetchPurchases();
  if (state.currentTab === 'map') updateMapStatus();
}

// Получить список домиков
async function fetchCottages() {
  try {
    const res = await fetch(`${apiBaseUrl}/cottages`);
    state.cottages = await res.json();
    renderCottages();
    updateDashboardStats();
    updateMapStatus();
  } catch (e) {
    console.error('Error fetching cottages:', e);
  }
}

// Получить данные по белью
async function fetchLaundry() {
  try {
    const res = await fetch(`${apiBaseUrl}/laundry`);
    state.laundry = await res.json();
    renderLaundry();
  } catch (e) {
    console.error('Error fetching laundry:', e);
  }
}

// Получить технические заявки
async function fetchRequests() {
  try {
    const res = await fetch(`${apiBaseUrl}/requests`);
    state.requests = await res.json();
    renderRequests();
  } catch (e) {
    console.error('Error fetching requests:', e);
  }
}

// Получить отчеты качества
async function fetchReports() {
  try {
    const res = await fetch(`${apiBaseUrl}/reports`);
    state.reports = await res.json();
    renderReports();
  } catch (e) {
    console.error('Error fetching reports:', e);
  }
}

// Получить закупки
async function fetchPurchases() {
  try {
    const res = await fetch(`${apiBaseUrl}/purchases`);
    state.purchases = await res.json();
    renderPurchases();
  } catch (e) {
    console.error('Error fetching purchases:', e);
  }
}

// Переключатель ролей (Супервайзер <-> Горничная)
function toggleUserRole() {
  state.currentRole = state.currentRole === 'supervisor' ? 'maid' : 'supervisor';
  localStorage.setItem('cottage_care_role', state.currentRole);
  updateRoleUI();
  renderCottages();
  refreshData();
}

// Обновить UI на основе роли
function updateRoleUI() {
  const isSupervisor = state.currentRole === 'supervisor';
  
  // Текст в шапке
  document.getElementById('header-role-name').innerText = isSupervisor ? 'Супервайзер' : 'Горничная';
  
  // Информация в профиле (Desktop Sidebar)
  document.getElementById('user-role-badge').innerText = isSupervisor ? 'Супервайзер' : 'Служба уборки';
  document.getElementById('user-name').innerText = isSupervisor ? 'Анна Ковалева' : 'Мария Иванова';
  document.getElementById('user-avatar').src = isSupervisor 
    ? 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=150'
    : 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=150';

  // Показ/скрытие блоков для ролей
  const bentoStats = document.getElementById('supervisor-bento-stats');
  const maidBanner = document.getElementById('maid-banner');
  const fabContainer = document.getElementById('supervisor-fab-container');

  if (isSupervisor) {
    if (bentoStats) bentoStats.classList.remove('hidden');
    if (maidBanner) maidBanner.classList.add('hidden');
    if (fabContainer) fabContainer.classList.remove('hidden');
  } else {
    if (bentoStats) bentoStats.classList.add('hidden');
    if (maidBanner) maidBanner.classList.remove('hidden');
    if (fabContainer) fabContainer.classList.add('hidden'); // У горничных нет FAB добавления заявок (они создают их внутри домика)
  }
}

// Обновление статистики панели супервайзера
function updateDashboardStats() {
  const ready = state.cottages.filter(c => c.status === 'green').length;
  const progress = state.cottages.filter(c => c.status === 'yellow').length;
  const review = state.cottages.filter(c => c.status === 'orange').length;

  document.getElementById('stats-ready').innerText = ready;
  document.getElementById('stats-progress').innerText = progress;
  document.getElementById('stats-review').innerText = review;
}

// Фильтрация домиков
function filterCottages(type) {
  state.filterType = type;
  // Обновляем активную кнопку фильтра
  document.querySelectorAll('.filter-btn').forEach(btn => {
    const f = btn.getAttribute('data-filter');
    if (f === type) {
      btn.className = 'filter-btn bg-primary text-white px-4 py-2 rounded-full text-xs font-semibold transition-all shadow-sm';
    } else {
      btn.className = 'filter-btn bg-white border border-outline-variant text-on-surface-variant px-4 py-2 rounded-full text-xs font-semibold hover:bg-surface-container-highest transition-all';
    }
  });
  renderCottages();
}

// Поиск домиков
function searchCottages() {
  state.searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
  renderCottages();
}

// Рендеринг списка домиков
function renderCottages() {
  const grid = document.getElementById('cottages-grid');
  if (!grid) return;
  grid.innerHTML = '';

  let filtered = [...state.cottages];

  // Применяем фильтр типа
  if (state.filterType !== 'all') {
    filtered = filtered.filter(c => c.type === state.filterType);
  }

  // Применяем строку поиска
  if (state.searchQuery) {
    filtered = filtered.filter(c => 
      c.number.toString().includes(state.searchQuery) || 
      c.name.toLowerCase().includes(state.searchQuery) ||
      c.type.toLowerCase().includes(state.searchQuery)
    );
  }

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-8 text-center text-on-surface-variant text-sm">
        <span class="material-symbols-outlined text-[48px] block mb-sm text-slate-300">search_off</span>
        Нет домиков по выбранным критериям
      </div>
    `;
    return;
  }

  filtered.forEach(c => {
    const checklistLength = c.checklist.length;
    const checkedLength = c.checklist_done.length;
    let progressPercent = checklistLength > 0 ? Math.round((checkedLength / checklistLength) * 100) : 0;
    if (c.status === 'green') progressPercent = 100;

    // Класс цвета в зависимости от статуса
    const statusClass = `status-${c.status}`;

    // Переводы статусов и стили
    let statusText = 'Свободен';
    let statusBadgeClass = 'bg-slate-100 text-slate-700';
    let iconName = 'schedule';

    if (c.status === 'yellow') {
      statusText = 'В процессе';
      statusBadgeClass = 'bg-yellow-100 text-yellow-800';
      iconName = 'sync';
    } else if (c.status === 'orange') {
      statusText = 'Ждет проверки';
      statusBadgeClass = 'bg-orange-100 text-orange-800';
      iconName = 'visibility';
    } else if (c.status === 'green') {
      statusText = 'Проверен / Готов';
      statusBadgeClass = 'bg-green-100 text-green-800';
      iconName = 'check_circle';
    }

    // Приоритет
    const isHighPriority = c.type === 'выезд+заезд' || c.priority <= 2;
    const priorityBadge = isHighPriority 
      ? `<span class="bg-error-container text-on-error-container font-semibold text-[10px] px-2 py-0.5 rounded-full flex items-center gap-xs">
          <span class="material-symbols-outlined text-[12px]">priority_high</span>Срочно
         </span>`
      : `<span class="bg-surface-container-highest text-on-surface-variant font-semibold text-[10px] px-2 py-0.5 rounded-full">Планово</span>`;

    // Текст кнопки действия
    let ctaButton = '';
    if (state.currentRole === 'supervisor') {
      if (c.status === 'orange') {
        ctaButton = `<button onclick="openInspectorModalByNumber(${c.number})" class="bg-orange-500 text-white hover:bg-orange-600 h-9 px-lg rounded-xl text-xs font-bold active:scale-95 transition-transform flex items-center gap-xs">Проверить</button>`;
      } else {
        ctaButton = `<button onclick="openInspectorModalByNumber(${c.number})" class="text-primary border border-primary/30 hover:bg-primary/5 h-9 px-lg rounded-xl text-xs font-bold active:scale-95 transition-transform">Управлять</button>`;
      }
    } else {
      // Роль: Горничная
      if (c.status === 'white') {
        ctaButton = `<button onclick="openMaidModalByNumber(${c.number})" class="bg-yellow-400 text-yellow-900 hover:bg-yellow-500 h-9 px-lg rounded-xl text-xs font-bold active:scale-95 transition-transform">Убрать</button>`;
      } else if (c.status === 'yellow') {
        ctaButton = `<button onclick="openMaidModalByNumber(${c.number})" class="bg-primary text-white hover:bg-primary/90 h-9 px-lg rounded-xl text-xs font-bold active:scale-95 transition-transform">Чек-лист</button>`;
      } else if (c.status === 'orange') {
        ctaButton = `<button disabled class="bg-slate-100 text-slate-400 h-9 px-lg rounded-xl text-xs font-bold cursor-not-allowed">Ждет проверку</button>`;
      } else if (c.status === 'green') {
        ctaButton = `<button disabled class="bg-green-50 text-green-400 border border-green-200 h-9 px-lg rounded-xl text-xs font-bold cursor-not-allowed flex items-center gap-xs"><span class="material-symbols-outlined text-[14px]">check</span>Готово</button>`;
      }
    }

    const card = document.createElement('div');
    card.className = `bg-white rounded-xl shadow-sm border border-outline-variant/10 border-l-[6px] ${statusClass} overflow-hidden hover:shadow-md transition-all active:scale-[0.99] cursor-pointer`;
    card.onclick = (e) => {
      // Предотвращаем срабатывание клика по карточке при клике на кнопки действия внутри неё
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      if (state.currentRole === 'supervisor') {
        openInspectorModalByNumber(c.number);
      } else {
        openMaidModalByNumber(c.number);
      }
    };

    card.innerHTML = `
      <div class="p-md md:p-lg space-y-md">
        <div class="flex justify-between items-start">
          <div>
            <h3 class="font-bold text-lg text-primary">${c.name} (№${c.number})</h3>
            <p class="text-xs text-on-surface-variant mt-0.5">${c.type.toUpperCase()}</p>
          </div>
          <div class="flex flex-col items-end gap-xs">
            ${priorityBadge}
            <span class="${statusBadgeClass} text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-xs">
              <span class="material-symbols-outlined text-[14px]">${iconName}</span>
              ${statusText}
            </span>
          </div>
        </div>
        
        <div class="space-y-sm">
          <div class="flex justify-between text-xs font-medium text-on-surface-variant">
            <span>Прогресс уборки</span>
            <span>${progressPercent}%</span>
          </div>
          <div class="w-full bg-surface-container-high h-2 rounded-full overflow-hidden">
            <div class="bg-secondary h-full transition-all duration-500" style="width: ${progressPercent}%"></div>
          </div>
          <div class="flex justify-between items-center pt-xs">
            <span class="text-xs text-on-surface-variant flex items-center gap-xs">
              <span class="material-symbols-outlined text-[16px]">bed</span>
              ${c.beds_big}Б, ${c.beds_medium}С, ${c.beds_small}М
            </span>
            ${ctaButton}
          </div>
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// Рендеринг вкладки белья
function renderLaundry() {
  const todayList = document.getElementById('laundry-today-list');
  const tomorrowList = document.getElementById('laundry-tomorrow-list');
  const stockInputs = document.getElementById('laundry-stock-inputs');
  
  if (!todayList || !tomorrowList || !stockInputs) return;

  todayList.innerHTML = '';
  tomorrowList.innerHTML = '';
  stockInputs.innerHTML = '';

  const { stock, needsToday, needsTomorrow } = state.laundry;

  // Рендеринг инвентаря на складе (Inputs)
  stock.forEach(item => {
    const todayNeed = needsToday[item.item_name] || 0;
    const tomorrowNeed = needsTomorrow[item.item_name] || 0;
    const deficit = todayNeed > item.quantity ? todayNeed - item.quantity : 0;
    
    const deficitText = deficit > 0 
      ? `<span class="text-error font-bold text-xs bg-error-container/40 px-2 py-0.5 rounded">Дефицит: -${deficit} шт.</span>`
      : `<span class="text-secondary font-bold text-xs bg-secondary-container/20 px-2 py-0.5 rounded">В наличии</span>`;

    // Инпуты (Супервайзер может редактировать, для горничной — readonly)
    const isSupervisor = state.currentRole === 'supervisor';
    const inputHtml = `
      <div class="bg-surface-container-low p-md rounded-xl border border-outline-variant/15 flex flex-col justify-between gap-sm">
        <div>
          <span class="font-bold text-primary block text-sm">${item.display_name}</span>
          <div class="mt-xs">${deficitText}</div>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-xs text-on-surface-variant">На складе:</span>
          <div class="flex items-center gap-xs">
            <input type="number" 
                   value="${item.quantity}" 
                   min="0"
                   ${isSupervisor ? '' : 'readonly'}
                   onchange="updateSingleStock('${item.item_name}', this.value)"
                   class="w-20 text-center bg-white border border-outline-variant/30 rounded-lg py-1 font-bold text-primary focus:outline-none focus:ring-1 focus:ring-primary text-sm"/>
            <span class="text-xs text-on-surface-variant font-medium">шт.</span>
          </div>
        </div>
      </div>
    `;
    stockInputs.innerHTML += inputHtml;

    // Рендеринг потребностей на сегодня
    const todayRow = `
      <div class="flex justify-between items-center py-sm border-b border-outline-variant/10">
        <span class="font-medium">${item.display_name}</span>
        <div class="flex items-center gap-md">
          <span class="text-on-surface-variant">Надо: <b>${todayNeed}</b></span>
          <span class="w-16 text-right text-xs ${deficit > 0 ? 'text-error font-bold' : 'text-secondary'}">Остаток: ${item.quantity}</span>
        </div>
      </div>
    `;
    todayList.innerHTML += todayRow;

    // Рендеринг потребностей на завтра
    const tomorrowRow = `
      <div class="flex justify-between items-center py-sm border-b border-outline-variant/10">
        <span class="font-medium">${item.display_name}</span>
        <span>Требуется: <b>${tomorrowNeed}</b></span>
      </div>
    `;
    tomorrowList.innerHTML += tomorrowRow;
  });
}

// Быстрое обновление остатка на складе
let stockUpdateTimeout = null;
function updateSingleStock(itemName, value) {
  const qty = parseInt(value) || 0;
  
  // Обновляем локальное состояние
  const item = state.laundry.stock.find(i => i.item_name === itemName);
  if (item) item.quantity = qty;

  // Показываем статус сохранения
  document.getElementById('laundry-edit-status').innerText = 'Сохранение...';

  // Дебаунс отправки на сервер
  clearTimeout(stockUpdateTimeout);
  stockUpdateTimeout = setTimeout(async () => {
    try {
      const stockArray = state.laundry.stock.map(s => ({ item_name: s.item_name, quantity: s.quantity }));
      await fetch(`${apiBaseUrl}/laundry/stock`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: stockArray })
      });
      document.getElementById('laundry-edit-status').innerText = 'Сохранено';
      setTimeout(() => {
        if (document.getElementById('laundry-edit-status')) {
          document.getElementById('laundry-edit-status').innerText = 'Изменения автосохраняются';
        }
      }, 2000);
      refreshData();
    } catch (e) {
      console.error('Error saving stock:', e);
      document.getElementById('laundry-edit-status').innerText = 'Ошибка сохранения!';
    }
  }, 800);
}

// Переключение табов заявок
function switchRequestSubtab(subtab) {
  state.requestSubtab = subtab;
  const urgentBtn = document.getElementById('req-subtab-urgent');
  const maintBtn = document.getElementById('req-subtab-maintenance');
  const urgentContent = document.getElementById('req-content-urgent');
  const maintContent = document.getElementById('req-content-maintenance');

  if (subtab === 'urgent') {
    urgentBtn.className = 'pb-sm font-bold text-sm transition-colors border-b-2 border-primary text-primary';
    maintBtn.className = 'pb-sm font-semibold text-sm transition-colors text-on-surface-variant hover:text-on-surface';
    urgentContent.classList.remove('hidden');
    maintContent.classList.add('hidden');
  } else {
    maintBtn.className = 'pb-sm font-bold text-sm transition-colors border-b-2 border-primary text-primary';
    urgentBtn.className = 'pb-sm font-semibold text-sm transition-colors text-on-surface-variant hover:text-on-surface';
    maintContent.classList.remove('hidden');
    urgentContent.classList.add('hidden');
  }
}

// Рендеринг технических заявок
function renderRequests() {
  const urgentList = document.getElementById('urgent-requests-list');
  const maintList = document.getElementById('maintenance-requests-list');
  
  if (!urgentList || !maintList) return;

  urgentList.innerHTML = '';
  maintList.innerHTML = '';

  const urgents = state.requests.filter(r => r.category === 'housekeeping' && r.status !== 'done');
  const maintenances = state.requests.filter(r => r.category === 'maintenance' && r.status !== 'done');

  // Обновляем бейджи количества
  document.getElementById('urgent-badge').innerText = `${urgents.length} В очереди`;
  document.getElementById('maintenance-badge').innerText = `${maintenances.length} Активно`;
  
  // Обновляем бейдж уведомления на мобильном таббаре
  const bubble = document.getElementById('requests-badge-bubble');
  const totalActive = urgents.length + maintenances.length;
  if (totalActive > 0) {
    bubble.innerText = totalActive;
    bubble.classList.remove('hidden');
  } else {
    bubble.classList.add('hidden');
  }

  // Наполнение списка быстрых задач (Urgent)
  if (urgents.length === 0) {
    urgentList.innerHTML = `
      <div class="py-6 text-center text-on-surface-variant text-sm bg-white rounded-xl border border-outline-variant/10 shadow-sm">
        <span class="material-symbols-outlined text-[36px] block mb-xs text-slate-300">verified</span>
        Нет нерешенных быстрых задач
      </div>
    `;
  } else {
    urgents.forEach(r => {
      const dateStr = new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const urgencyTag = r.urgency === 'urgent' 
        ? '<span class="text-error font-bold text-xs flex items-center gap-xs"><span class="material-symbols-outlined text-[14px]">priority_high</span>Высокий</span>'
        : '<span class="text-on-surface-variant text-xs">Обычный</span>';

      const card = document.createElement('div');
      card.className = 'bg-white rounded-xl p-md border border-slate-200/50 shadow-sm border-l-[6px] border-l-error flex items-start gap-md transition-all hover:shadow-md animate-fade-in';
      card.innerHTML = `
        <div class="flex-1">
          <div class="flex justify-between items-start">
            <span class="font-bold text-primary">Домик №${r.cottage_number}</span>
            <div class="flex items-center gap-sm">
              <span class="text-[10px] text-on-surface-variant">${dateStr}</span>
              ${urgencyTag}
            </div>
          </div>
          <p class="text-sm text-on-surface-variant mt-1">${r.description}</p>
        </div>
        <div class="flex flex-col justify-center">
          <input type="checkbox" onchange="toggleRequestStatus(${r.id}, 'done', this)" class="w-6 h-6 rounded-lg border-outline-variant text-primary focus:ring-primary cursor-pointer transition-all"/>
        </div>
      `;
      urgentList.appendChild(card);
    });
  }

  // Наполнение списка ремонтов (Maintenance)
  if (maintenances.length === 0) {
    maintList.innerHTML = `
      <div class="py-6 text-center text-on-surface-variant text-sm bg-white rounded-xl border border-outline-variant/10 shadow-sm">
        <span class="material-symbols-outlined text-[36px] block mb-xs text-slate-300">build_circle</span>
        Нет активных технических заявок
      </div>
    `;
  } else {
    maintenances.forEach(r => {
      const dateStr = new Date(r.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const isUrgent = r.urgency === 'urgent';
      const urgencyTag = isUrgent
        ? '<span class="text-error font-bold text-xs flex items-center gap-xs"><span class="material-symbols-outlined text-[14px]">warning</span>Срочный ремонт</span>'
        : '<span class="text-on-surface-variant text-xs">Плановый ремонт</span>';

      // Кнопки управления в зависимости от статуса заявки
      let actionButtons = '';
      if (r.status === 'pending') {
        actionButtons = `
          <div class="mt-md flex gap-sm">
            <button onclick="toggleRequestStatus(${r.id}, 'sent_to_tech')" class="flex-1 h-9 bg-primary text-white rounded-lg text-xs font-bold active:scale-95 transition-all">Передать техникам</button>
            <button onclick="toggleRequestStatus(${r.id}, 'done')" class="h-9 border px-md text-secondary rounded-lg text-xs font-bold hover:bg-slate-50 active:scale-95 transition-all flex items-center justify-center"><span class="material-symbols-outlined">check</span></button>
          </div>
        `;
      } else if (r.status === 'sent_to_tech') {
        actionButtons = `
          <div class="mt-md flex gap-sm">
            <span class="flex-1 h-9 bg-secondary-container text-on-secondary-container rounded-lg text-xs font-bold flex items-center justify-center gap-xs"><span class="material-symbols-outlined text-[16px]">engineering</span>У техников</span>
            <button onclick="toggleRequestStatus(${r.id}, 'done')" class="flex-1 h-9 bg-secondary text-white rounded-lg text-xs font-bold active:scale-95 transition-all">Завершить ремонт</button>
          </div>
        `;
      }

      const card = document.createElement('div');
      card.className = 'bg-white rounded-xl p-md border border-slate-200/50 shadow-sm border-l-[6px] border-l-primary transition-all hover:shadow-md animate-fade-in';
      card.innerHTML = `
        <div class="flex justify-between items-start">
          <div>
            <span class="font-bold text-primary text-base">Домик №${r.cottage_number}</span>
            <p class="text-sm text-on-surface-variant mt-1">${r.description}</p>
          </div>
          <div class="flex flex-col items-end gap-xs">
            <span class="text-[10px] text-on-surface-variant">${dateStr}</span>
            ${urgencyTag}
          </div>
        </div>
        ${actionButtons}
      `;
      maintList.appendChild(card);
    });
  }

  // Обновление селектора домиков в форме новой заявки
  const select = document.getElementById('req-cottage-number');
  if (select) {
    select.innerHTML = '';
    state.cottages.forEach(c => {
      const option = document.createElement('option');
      option.value = c.number;
      option.innerText = `${c.name} (№${c.number})`;
      select.appendChild(option);
    });
  }
}

// Переключение выполнения заявки
async function toggleRequestStatus(id, newStatus, checkboxEl = null) {
  // Анимация зачеркивания/скрытия для чекбокса
  if (checkboxEl && checkboxEl.checked) {
    const card = checkboxEl.closest('.bg-white');
    card.classList.add('opacity-40', 'scale-[0.98]');
  }

  try {
    const res = await fetch(`${apiBaseUrl}/requests/${id}/toggle`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (data.success) {
      if (tg) tg.HapticFeedback.notificationOccurred('success');
      setTimeout(refreshData, checkboxEl ? 500 : 0); // Небольшая задержка для анимации
    }
  } catch (e) {
    console.error('Error toggling request:', e);
    refreshData();
  }
}

// Открытие модального окна новой заявки
function openNewRequestModal(prefilledCottageNum = null) {
  document.getElementById('request-modal').classList.remove('hidden');
  if (prefilledCottageNum) {
    document.getElementById('req-cottage-number').value = prefilledCottageNum;
  }
}

// Закрытие модального окна новой заявки
function closeNewRequestModal() {
  document.getElementById('request-modal').classList.add('hidden');
  document.getElementById('req-description').value = '';
}

// Отправка новой заявки
async function submitNewRequest(e) {
  e.preventDefault();
  const cottage_number = parseInt(document.getElementById('req-cottage-number').value);
  const category = document.querySelector('input[name="req-category"]:checked').value;
  const urgency = document.getElementById('req-urgency').value;
  const description = document.getElementById('req-description').value.trim();

  try {
    const res = await fetch(`${apiBaseUrl}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cottage_number, category, description, urgency })
    });
    const data = await res.json();
    if (data.success) {
      closeNewRequestModal();
      refreshData();
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    }
  } catch (err) {
    console.error('Error submitting request:', err);
  }
}

// Рендеринг отчетов и отзывов
function renderReports() {
  const { reviews, stats, commonIssues } = state.reports;

  // Оценка качества (число)
  document.getElementById('avg-rating-score').innerText = stats.avg_score.toFixed(1);
  
  // Оценка качества (звездочки)
  const starsEl = document.getElementById('avg-rating-stars');
  starsEl.innerHTML = '';
  const fullStars = Math.round(stats.avg_score);
  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('span');
    star.className = 'material-symbols-outlined';
    star.style.fontVariationSettings = `'FILL' ${i <= fullStars ? 1 : 0}`;
    star.innerText = 'star';
    starsEl.appendChild(star);
  }

  // Рендеринг частых замечаний
  const issuesList = document.getElementById('common-issues-list');
  issuesList.innerHTML = '';
  if (commonIssues.length === 0) {
    issuesList.innerHTML = '<li class="text-secondary font-semibold">Замечаний не зафиксировано, все чисто! 🎉</li>';
  } else {
    commonIssues.forEach(issue => {
      issuesList.innerHTML += `
        <li class="flex justify-between py-1 border-b border-outline-variant/10 text-on-surface-variant">
          <span>"${issue.comments}"</span>
          <span class="font-bold text-error bg-error-container/40 px-2 py-0.5 rounded text-xs">${issue.count} раз(а)</span>
        </li>
      `;
    });
  }

  // Рендеринг таблицы истории проверок
  const tbody = document.getElementById('reviews-history-table');
  tbody.innerHTML = '';
  if (reviews.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-lg text-center text-on-surface-variant">История пуста</td></tr>';
  } else {
    reviews.forEach(r => {
      // Генерация звездочек
      let starsHtml = '';
      for (let i = 1; i <= 5; i++) {
        starsHtml += `<span class="material-symbols-outlined text-[16px] text-yellow-500" style="font-variation-settings: 'FILL' ${i <= r.score ? 1 : 0}">star</span>`;
      }

      tbody.innerHTML += `
        <tr class="border-b hover:bg-slate-50 transition-colors">
          <td class="p-md font-semibold text-primary">Домик №${r.cottage_number}</td>
          <td class="p-md text-xs text-on-surface-variant">${r.date}</td>
          <td class="p-md"><div class="flex gap-xs">${starsHtml}</div></td>
          <td class="p-md text-sm text-on-surface-variant">${r.comments || '<span class="italic text-slate-300">нет примечаний</span>'}</td>
        </tr>
      `;
    });
  }
}

// Рендеринг закупок
function renderPurchases() {
  const tbody = document.getElementById('purchases-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (state.purchases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="p-lg text-center text-on-surface-variant">Список закупок пуст</td></tr>';
    return;
  }

  state.purchases.forEach(p => {
    const dateStr = new Date(p.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
    
    // Статус и интерактивный бадж
    let statusText = 'В очереди';
    let statusClass = 'bg-yellow-100 text-yellow-800';
    if (p.status === 'ordered') {
      statusText = 'Заказано';
      statusClass = 'bg-blue-100 text-blue-800';
    } else if (p.status === 'purchased') {
      statusText = 'Куплено';
      statusClass = 'bg-green-100 text-green-800';
    }

    const tr = document.createElement('tr');
    tr.className = 'border-b hover:bg-slate-50 transition-colors';
    tr.innerHTML = `
      <td class="p-md font-bold text-primary">${p.item_name}</td>
      <td class="p-md font-semibold text-on-surface-variant">${p.quantity} шт.</td>
      <td class="p-md text-xs text-on-surface-variant">${dateStr}</td>
      <td class="p-md">
        <button onclick="cyclePurchaseStatus(${p.id}, '${p.status}')" class="${statusClass} text-xs font-bold px-3 py-1 rounded-full active:scale-95 transition-all">
          ${statusText}
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Смена статуса закупки по кругу (pending -> ordered -> purchased -> pending)
async function cyclePurchaseStatus(id, currentStatus) {
  let nextStatus = 'pending';
  if (currentStatus === 'pending') nextStatus = 'ordered';
  else if (currentStatus === 'ordered') nextStatus = 'purchased';
  
  try {
    await fetch(`${apiBaseUrl}/purchases/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus })
    });
    refreshData();
    if (tg) tg.HapticFeedback.selectionChanged();
  } catch (e) {
    console.error('Error cycling purchase status:', e);
  }
}

// Добавить позицию в закупки
async function addPurchaseItem(e) {
  e.preventDefault();
  const nameEl = document.getElementById('purchase-item-name');
  const qtyEl = document.getElementById('purchase-item-qty');
  const item_name = nameEl.value.trim();
  const quantity = parseInt(qtyEl.value) || 1;

  try {
    const res = await fetch(`${apiBaseUrl}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_name, quantity, urgency: 'normal' })
    });
    const data = await res.json();
    if (data.success) {
      nameEl.value = '';
      qtyEl.value = '';
      refreshData();
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    }
  } catch (err) {
    console.error('Error adding purchase:', err);
  }
}

// Скопировать заявку на закупку в буфер обмена
function copyPurchaseRequest() {
  const pending = state.purchases.filter(p => p.status === 'pending');
  if (pending.length === 0) {
    alert('Нет новых позиций для закупки!');
    return;
  }

  let text = '📋 *Заявка на дозакупку расходных материалов*:\n\n';
  pending.forEach((p, idx) => {
    text += `${idx + 1}. ${p.item_name} — ${p.quantity} шт.\n`;
  });
  text += '\n_Сформировано автоматически в Cottage Care_';

  navigator.clipboard.writeText(text).then(() => {
    alert('Текст заявки скопирован в буфер обмена!');
    if (tg) tg.HapticFeedback.notificationOccurred('success');
  }).catch(e => {
    console.error('Failed to copy text:', e);
  });
}

// Очистить купленное
async function clearPurchased() {
  if (!confirm('Вы уверены, что хотите удалить купленные позиции из списка?')) return;
  try {
    await fetch(`${apiBaseUrl}/purchases`, { method: 'DELETE' });
    refreshData();
  } catch (e) {
    console.error(e);
  }
}

// Интерактивная карта территории
function updateMapStatus() {
  state.cottages.forEach(c => {
    const cabinGroup = document.getElementById(`map-cabin-${c.number}`);
    if (cabinGroup) {
      const rect = cabinGroup.querySelector('rect');
      if (rect) {
        // Устанавливаем цвет на основе статуса уборки
        if (c.status === 'white') {
          rect.style.fill = '#ffffff';
          rect.style.stroke = '#c2c7ca';
        } else if (c.status === 'yellow') {
          rect.style.fill = '#fef08a'; // yellow-200
          rect.style.stroke = '#fbbf24'; // yellow-400
        } else if (c.status === 'orange') {
          rect.style.fill = '#ffedd5'; // orange-100
          rect.style.stroke = '#f97316'; // orange-500
        } else if (c.status === 'green') {
          rect.style.fill = '#dcfce7'; // green-100
          rect.style.stroke = '#22c55e'; // green-500
        }
      }
    }
  });
}

// Клик по домику на карте
function onMapCottageClick(number) {
  if (state.currentRole === 'supervisor') {
    openInspectorModalByNumber(number);
  } else {
    openMaidModalByNumber(number);
  }
}

// ==================== ЛОГИКА МОДАЛЬНЫХ ОКОН ====================

// --- МОДАЛЬНОЕ ОКНО СУПЕРВАЙЗЕРА ---

function openInspectorModalByNumber(number) {
  const cottage = state.cottages.find(c => c.number === number);
  if (cottage) openInspectorModal(cottage);
}

function openInspectorModal(cottage) {
  state.selectedCottage = cottage;
  
  document.getElementById('inspect-cottage-title').innerText = `${cottage.name} (№${cottage.number})`;
  document.getElementById('inspect-cottage-type').innerText = cottage.type.toUpperCase();
  document.getElementById('inspect-priority-val').innerText = cottage.priority;
  document.getElementById('inspect-beds-info').innerText = `${cottage.beds_big}Б, ${cottage.beds_medium}С, ${cottage.beds_small}М (Резинок: ${cottage.beds_elastic})`;
  
  // Наполнение чек-листа
  const progressPercent = cottage.checklist.length > 0 
    ? Math.round((cottage.checklist_done.length / cottage.checklist.length) * 100) 
    : 0;
  
  const progressBar = document.getElementById('inspect-checklist-progress-bar').firstElementChild;
  progressBar.style.width = `${progressPercent}%`;

  const checklistDoneUl = document.getElementById('inspect-checklist-done-items');
  checklistDoneUl.innerHTML = '';
  cottage.checklist.forEach(item => {
    const isDone = cottage.checklist_done.includes(item);
    checklistDoneUl.innerHTML += `
      <li class="flex items-center gap-xs py-0.5">
        <span class="material-symbols-outlined text-[16px] ${isDone ? 'text-secondary' : 'text-slate-300'}" style="font-variation-settings: 'FILL' ${isDone ? 1 : 0}">
          ${isDone ? 'check_circle' : 'radio_button_unchecked'}
        </span>
        <span class="${isDone ? 'line-through text-slate-400' : 'font-medium text-slate-700'}">${item}</span>
      </li>
    `;
  });

  // Комментарий горничной
  const maidCommentContainer = document.getElementById('inspect-maid-comment-container');
  if (cottage.maid_comment) {
    maidCommentContainer.classList.remove('hidden');
    document.getElementById('inspect-maid-comment').innerText = cottage.maid_comment;
  } else {
    maidCommentContainer.classList.add('hidden');
  }

  // Оценка (Review Form)
  const reviewPanel = document.getElementById('inspect-review-panel');
  if (cottage.status === 'orange' || cottage.status === 'green') {
    reviewPanel.classList.remove('hidden');
    setReviewRating(cottage.rating_score || 5);
    document.getElementById('inspect-review-comment').value = cottage.rating_comment || '';
  } else {
    reviewPanel.classList.add('hidden');
  }

  // Панель ручного сброса статуса
  const manualStatusPanel = document.getElementById('inspect-manual-status-panel');
  if (cottage.status !== 'orange') {
    manualStatusPanel.classList.remove('hidden');
  } else {
    manualStatusPanel.classList.add('hidden');
  }

  document.getElementById('inspector-modal').classList.remove('hidden');
}

function closeInspectorModal() {
  document.getElementById('inspector-modal').classList.add('hidden');
  state.selectedCottage = null;
}

// Звездочки оценки
function setReviewRating(rating) {
  state.selectedRating = rating;
  const stars = document.querySelectorAll('.rating-star');
  stars.forEach((star, idx) => {
    if (idx < rating) {
      star.classList.remove('text-gray-300');
      star.classList.add('text-yellow-500');
      star.style.fontVariationSettings = "'FILL' 1";
    } else {
      star.classList.remove('text-yellow-500');
      star.classList.add('text-gray-300');
      star.style.fontVariationSettings = "'FILL' 0";
    }
  });
}

// Ручное изменение приоритета в модалке
async function changeCottagePriority(delta) {
  if (!state.selectedCottage) return;
  const newPriority = Math.max(0, state.selectedCottage.priority + delta);
  try {
    const res = await fetch(`${apiBaseUrl}/cottages/${state.selectedCottage.number}/priority`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: newPriority })
    });
    const data = await res.json();
    if (data.success) {
      state.selectedCottage.priority = newPriority;
      document.getElementById('inspect-priority-val').innerText = newPriority;
      refreshData();
    }
  } catch (e) {
    console.error(e);
  }
}

// Ручное изменение статуса в модалке супервайзера
async function changeCottageStatus(status) {
  if (!state.selectedCottage) return;
  try {
    const res = await fetch(`${apiBaseUrl}/cottages/${state.selectedCottage.number}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (data.success) {
      closeInspectorModal();
      refreshData();
    }
  } catch (e) {
    console.error(e);
  }
}

// Отправка отзыва супервайзером
async function submitCottageReview() {
  if (!state.selectedCottage) return;
  const score = state.selectedRating;
  const comment = document.getElementById('inspect-review-comment').value.trim();

  try {
    const res = await fetch(`${apiBaseUrl}/cottages/${state.selectedCottage.number}/review`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score, comment })
    });
    const data = await res.json();
    if (data.success) {
      closeInspectorModal();
      refreshData();
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    }
  } catch (e) {
    console.error(e);
  }
}

// --- МОДАЛЬНОЕ ОКНО ГОРНИЧНОЙ ---

function openMaidModalByNumber(number) {
  const cottage = state.cottages.find(c => c.number === number);
  if (cottage) openMaidModal(cottage);
}

function openMaidModal(cottage) {
  state.selectedCottage = cottage;
  
  document.getElementById('maid-cottage-title').innerText = `${cottage.name} (№${cottage.number})`;
  document.getElementById('maid-cottage-type').innerText = cottage.type.toUpperCase();
  document.getElementById('maid-text-comment').value = cottage.maid_comment || '';

  // Управление кнопками статуса
  const btnStart = document.getElementById('maid-btn-start');
  const btnComplete = document.getElementById('maid-btn-complete');
  const checklistSection = document.getElementById('maid-checklist-section');

  if (cottage.status === 'white') {
    btnStart.classList.remove('hidden');
    btnComplete.classList.add('hidden');
    checklistSection.classList.add('opacity-50', 'pointer-events-none');
  } else if (cottage.status === 'yellow') {
    btnStart.classList.add('hidden');
    btnComplete.classList.remove('hidden');
    checklistSection.classList.remove('opacity-50', 'pointer-events-none');
  }

  // Генерация чек-боксов цифрового чек-листа
  const checklistList = document.getElementById('maid-checklist-list');
  checklistList.innerHTML = '';
  
  cottage.checklist.forEach((item, index) => {
    const isChecked = cottage.checklist_done.includes(item);
    const id = `maid-chk-${index}`;
    
    const div = document.createElement('div');
    div.className = 'flex items-center gap-md p-sm border rounded-lg bg-surface-container-low cursor-pointer hover:bg-slate-50 transition-colors';
    div.onclick = (e) => {
      if (e.target.tagName !== 'INPUT') {
        const checkbox = document.getElementById(id);
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    };

    div.innerHTML = `
      <input type="checkbox" id="${id}" 
             ${isChecked ? 'checked' : ''} 
             onchange="onChecklistChange('${item}', this.checked)"
             class="w-6 h-6 rounded border-outline-variant text-primary focus:ring-primary cursor-pointer"/>
      <label class="text-sm font-semibold text-primary cursor-pointer flex-1">${item}</label>
    `;
    checklistList.appendChild(div);
  });

  updateMaidCompleteButtonState();
  document.getElementById('maid-modal').classList.remove('hidden');
}

function closeMaidModal() {
  document.getElementById('maid-modal').classList.add('hidden');
  state.selectedCottage = null;
}

// Горничная отмечает чек-бокс
async function onChecklistChange(item, isChecked) {
  if (!state.selectedCottage) return;
  
  let done = [...state.selectedCottage.checklist_done];
  if (isChecked) {
    if (!done.includes(item)) done.push(item);
  } else {
    done = done.filter(i => i !== item);
  }
  
  state.selectedCottage.checklist_done = done;
  updateMaidCompleteButtonState();

  try {
    await fetch(`${apiBaseUrl}/cottages/${state.selectedCottage.number}/checklist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checklist_done: done })
    });
    if (tg) tg.HapticFeedback.selectionChanged();
  } catch (e) {
    console.error(e);
  }
}

// Проверка возможности завершить уборку (кнопка активна только при 100% чеклисте)
function updateMaidCompleteButtonState() {
  if (!state.selectedCottage) return;
  const cottage = state.selectedCottage;
  const btn = document.getElementById('maid-btn-complete');
  
  const allChecked = cottage.checklist.every(item => cottage.checklist_done.includes(item));
  
  if (allChecked && cottage.status === 'yellow') {
    btn.disabled = false;
    btn.classList.remove('opacity-50', 'cursor-not-allowed');
  } else {
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
  }
}

// Горничная берет в работу
async function maidStartClean() {
  if (!state.selectedCottage) return;
  
  try {
    const res = await fetch(`${apiBaseUrl}/cottages/${state.selectedCottage.number}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'yellow' })
    });
    const data = await res.json();
    if (data.success) {
      state.selectedCottage.status = 'yellow';
      openMaidModal(state.selectedCottage); // перерисовываем модалку в статус "В процессе"
      refreshData();
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    }
  } catch (e) {
    console.error(e);
  }
}

// Горничная завершает уборку
async function maidCompleteClean() {
  if (!state.selectedCottage) return;
  const maid_comment = document.getElementById('maid-text-comment').value.trim();

  try {
    const res = await fetch(`${apiBaseUrl}/cottages/${state.selectedCottage.number}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'orange', maid_comment })
    });
    const data = await res.json();
    if (data.success) {
      closeMaidModal();
      refreshData();
      if (tg) tg.HapticFeedback.notificationOccurred('success');
    }
  } catch (e) {
    console.error(e);
  }
}

// Горничная сообщает о поломке
function openMaidReportFaultModal() {
  if (!state.selectedCottage) return;
  const number = state.selectedCottage.number;
  closeMaidModal();
  openNewRequestModal(number);
  // Переключаем форму категорий на "ремонт"
  document.querySelector('input[name="req-category"][value="maintenance"]').checked = true;
}
