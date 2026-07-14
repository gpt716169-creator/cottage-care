# Cottage Care — Telegram Mini App для управления уборкой домиков

Информационная система и Telegram Mini App для автоматизации работы супервайзера и службы уборки (горничных) загородных домиков. Проект переводит работу с заметок и раций в единую цифровую среду.

## Ссылки на проект и сервисы
*   **GitHub Репозиторий**: [https://github.com/gpt716169-creator/cottage-care](https://github.com/gpt716169-creator/cottage-care)
*   **Supabase Проект**: `cottage-care` (ID: `lfkyusmzglfjyxpklmnd`)
    *   **Supabase URL**: `https://lfkyusmzglfjyxpklmnd.supabase.co`
    *   **Таблицы в БД**: `cottages`, `laundry_stock`, `tech_requests`, `quality_reviews`, `purchases` созданы и наполнены демо-данными.

---

## Локальный запуск

1.  **Клонирование и установка**:
    ```bash
    git clone https://github.com/gpt716169-creator/cottage-care.git
    cd cottage-care
    npm install
    ```
2.  **Настройка окружения**:
    Создайте или отредактируйте файл `.env`:
    ```env
    PORT=3000
    TELEGRAM_BOT_TOKEN=8836442756:AAEHFHGiDBYresCJDEhBv_iuohS7SawKJwc-
    PROXY_URL=http://x9fut9:8xe30g@161.0.7.162:8000
    
    # Для работы с локальным SQLite оставьте строку ниже закомментированной.
    # Для работы с Supabase (PostgreSQL) раскомментируйте и настройте:
    # DATABASE_URL=postgres://postgres:[ВАШ_ПАРОЛЬ]@db.lfkyusmzglfjyxpklmnd.supabase.co:5432/postgres
    ```
3.  **Запуск**:
    ```bash
    npm run dev
    ```
4.  **Тестирование**:
    Откройте в браузере `http://localhost:3000` для тестирования веб-приложения.

---

## Настройка Supabase в продакшене

Мы уже создали базу данных и импортировали таблицы с начальными данными на Supabase. Чтобы бэкенд ( Express сервер) переключился на работу с ней:
1.  Перейдите в панель управления Supabase: [https://supabase.com/dashboard/project/lfkyusmzglfjyxpklmnd/settings/database](https://supabase.com/dashboard/project/lfkyusmzglfjyxpklmnd/settings/database).
2.  В разделе **Database password** нажмите **Reset password** и задайте новый пароль.
3.  Скопируйте строку подключения **Connection string** (режим Session Pool / Transaction Pool) в формате URL. Она выглядит так:
    `postgres://postgres:[ВАШ_ПАРОЛЬ]@db.lfkyusmzglfjyxpklmnd.supabase.co:5432/postgres`
4.  Вставьте полученную строку в переменную `DATABASE_URL` в настройках проекта на Vercel или в локальный `.env`. При наличии этой переменной сервер автоматически переключается с SQLite на PostgreSQL Supabase.

---

## Деплой на Vercel

1.  Перейдите на [Vercel](https://vercel.com) и импортируйте репозиторий `gpt716169-creator/cottage-care`.
2.  В настройках проекта (Environment Variables) добавьте следующие переменные:
    *   `DATABASE_URL`: Строка подключения к Supabase (см. пункт выше).
    *   `TELEGRAM_BOT_TOKEN`: Токен вашего Telegram-бота.
    *   `WEBAPP_URL`: Ссылка на ваш развернутый проект на Vercel (например, `https://cottage-care.vercel.app`), чтобы бот знал, какую страницу открывать по кнопке.
3.  Нажмите **Deploy**. Vercel автоматически развернет статический фронтенд и бэкенд в виде Serverless-функции `api/server.js`.
4.  После деплоя бот автоматически переключится в режим вебхуков и будет обрабатывать запросы по адресу `https://<your-vercel-domain>/api/bot-webhook`.
