import sqlite3 from 'sqlite3';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const isProduction = !!process.env.DATABASE_URL;
let dbInstance = null;
let dbType = 'sqlite';

// Функция форматирования запросов (замена ? на $1, $2 для PostgreSQL)
function prepareSql(sql) {
  if (dbType === 'postgres') {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  }
  return sql;
}

// Инициализация соединения
export async function initDb() {
  if (dbInstance) return dbInstance;

  if (isProduction) {
    dbType = 'postgres';
    console.log('Connecting to PostgreSQL database...');
    try {
      const pool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });
      // Тестовый запрос для проверки соединения
      await pool.query('SELECT 1');
      dbInstance = pool;
      console.log('PostgreSQL connection established successfully.');
    } catch (e) {
      console.warn('PostgreSQL connection failed. Falling back to SQLite local database. Error:', e.message);
      dbType = 'sqlite';
    }
  }

  if (!isProduction || dbType === 'sqlite') {
    dbType = 'sqlite';
    console.log('Connecting to SQLite database...');
    const dbPath = path.resolve('db.sqlite3');
    
    // Обеспечиваем существование папки для бд, если надо
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    dbInstance = new sqlite3.Database(dbPath);
  }

  await createTables();
  await seedInitialData();

  return dbInstance;
}

// Выполнение SELECT запросов (возвращает массив строк)
export async function query(sql, params = []) {
  const formattedSql = prepareSql(sql);
  
  if (dbType === 'postgres') {
    const res = await dbInstance.query(formattedSql, params);
    return res.rows;
  } else {
    return new Promise((resolve, reject) => {
      dbInstance.all(formattedSql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

// Получение одной строки
export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

// Выполнение INSERT/UPDATE/DELETE
export async function run(sql, params = []) {
  const formattedSql = prepareSql(sql);

  if (dbType === 'postgres') {
    const res = await dbInstance.query(formattedSql, params);
    return {
      changes: res.rowCount,
      lastInsertId: res.rows[0]?.id || null
    };
  } else {
    return new Promise((resolve, reject) => {
      dbInstance.run(formattedSql, params, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes, lastInsertId: this.lastID });
      });
    });
  }
}

// Создание таблиц
async function createTables() {
  const isPg = dbType === 'postgres';
  const serialType = isPg ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
  
  // Таблица домиков
  await run(`
    CREATE TABLE IF NOT EXISTS cottages (
      id ${serialType},
      number INTEGER UNIQUE NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      priority INTEGER DEFAULT 0,
      status TEXT DEFAULT 'white',
      beds_big INTEGER DEFAULT 0,
      beds_medium INTEGER DEFAULT 0,
      beds_small INTEGER DEFAULT 0,
      beds_elastic INTEGER DEFAULT 0,
      stay_over_full INTEGER DEFAULT 0,
      maid_id TEXT,
      checklist TEXT,
      checklist_done TEXT,
      maid_comment TEXT,
      rating_score INTEGER DEFAULT 0,
      rating_comment TEXT
    )
  `);

  // Таблица учета белья (на складе)
  await run(`
    CREATE TABLE IF NOT EXISTS laundry_stock (
      item_name TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 0
    )
  `);

  // Таблица технических заявок
  await run(`
    CREATE TABLE IF NOT EXISTS tech_requests (
      id ${serialType},
      cottage_number INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      urgency TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL
    )
  `);

  // Таблица качества уборок
  await run(`
    CREATE TABLE IF NOT EXISTS quality_reviews (
      id ${serialType},
      cottage_number INTEGER NOT NULL,
      score INTEGER NOT NULL,
      comments TEXT,
      date TEXT NOT NULL
    )
  `);

  // Таблица закупок
  await run(`
    CREATE TABLE IF NOT EXISTS purchases (
      id ${serialType},
      item_name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      urgency TEXT DEFAULT 'normal',
      status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL
    )
  `);
}

// Первичное наполнение тестовыми данными
async function seedInitialData() {
  const cottageCount = await queryOne('SELECT COUNT(*) as count FROM cottages');
  if (cottageCount.count === 0) {
    console.log('Seeding initial cottages...');
    const initialCottages = [
      [1, 'Домик 1', 'выезд+заезд', 1, 'orange', 1, 0, 2, 1, 0, '1', '["Пыль в спальне","Вынос мусора","Замена постельного белья","Полотенца"]', '["Пыль в спальне","Замена постельного белья"]', 'Уборка почти закончена, осталось донести полотенца', 0, ''],
      [2, 'Домик 2', 'промежуточная', 2, 'yellow', 1, 1, 0, 0, 1, '1', '["Замена постельного белья","Полотенца","Влажная уборка"]', '["Полотенца"]', 'В процессе уборки', 0, ''],
      [3, 'Домик 3', 'выезд', 3, 'green', 2, 0, 0, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', 'Все готово для заселения', 5, 'Чисто, без нареканий'],
      [4, 'Домик 4', 'выезд', 4, 'white', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [5, 'Домик 5', 'выезд+заезд', 5, 'yellow', 0, 1, 2, 0, 0, '2', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Пыль"]', 'Приступили к работе', 0, ''],
      [6, 'Домик 6', 'промежуточная', 6, 'green', 1, 0, 0, 1, 0, '2', '["Полотенца","Влажная уборка"]', '["Полотенца","Влажная уборка"]', 'Готово', 4, 'Хорошо убрано'],
      [7, 'Домик 7', 'выезд', 7, 'white', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [8, 'Домик 8', 'промежуточная', 8, 'white', 1, 1, 0, 0, 0, '', '["Полотенца","Влажная уборка"]', '[]', '', 0, ''],
      [9, 'Домик 9', 'выезд', 9, 'yellow', 2, 0, 0, 0, 0, '1', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Пыль","Вынос мусора"]', 'Убираем гостиную', 0, ''],
      [10, 'Домик 10', 'выезд', 10, 'orange', 1, 0, 2, 1, 0, '2', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', 'Закончила, жду проверки', 0, ''],
      [11, 'Домик 11', 'выезд', 11, 'green', 0, 1, 2, 0, 0, '3', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', 'Проверено супервайзером', 5, 'Отлично'],
      [12, 'Домик 12', 'промежуточная', 12, 'white', 1, 0, 0, 1, 0, '', '["Полотенца","Влажная уборка"]', '[]', '', 0, ''],
      [13, 'Домик 13', 'выезд', 13, 'white', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [14, 'Домик 14', 'выезд', 14, 'yellow', 1, 1, 0, 0, 0, '2', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Постельное белье"]', 'Сменила белье', 0, ''],
      [15, 'Домик 15', 'выезд+заезд', 15, 'orange', 2, 0, 0, 0, 0, '1', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', 'Готово', 0, ''],
      [16, 'Домик 16', 'выезд', 16, 'green', 1, 0, 2, 1, 0, '3', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', 'Убрано', 5, ''],
      [17, 'Домик 17', 'промежуточная', 17, 'white', 0, 1, 2, 0, 1, '', '["Замена постельного белья","Полотенца","Влажная уборка"]', '[]', '', 0, ''],
      [18, 'Домик 18', 'выезд', 18, 'white', 1, 0, 0, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [19, 'Домик 19', 'выезд', 19, 'yellow', 1, 0, 2, 1, 0, '1', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Вынос мусора"]', 'Только зашла', 0, ''],
      [20, 'Домик 20', 'промежуточная', 20, 'orange', 1, 1, 0, 0, 1, '2', '["Замена постельного белья","Полотенца","Влажная уборка"]', '["Замена постельного белья","Полотенца","Влажная уборка"]', 'Жду проверки', 0, ''],
      [21, 'Домик 21', 'выезд', 21, 'green', 2, 0, 0, 0, 0, '3', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', 'Готово', 4, 'Хорошо'],
      [22, 'Домик 22', 'выезд+заезд', 22, 'white', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [23, 'Домик 23', 'выезд', 23, 'white', 0, 1, 2, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, '']
    ];

    for (const c of initialCottages) {
      await run(`
        INSERT INTO cottages (number, name, type, priority, status, beds_big, beds_medium, beds_small, beds_elastic, stay_over_full, maid_id, checklist, checklist_done, maid_comment, rating_score, rating_comment)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, c);
    }
  }

  const laundryCount = await queryOne('SELECT COUNT(*) as count FROM laundry_stock');
  if (laundryCount.count === 0) {
    console.log('Seeding initial laundry stock...');
    const initialLaundry = [
      ['sheet_big', 'Комплект Большой', 15],
      ['sheet_medium', 'Комплект Средний', 10],
      ['sheet_small', 'Комплект Маленький', 20],
      ['sheet_elastic', 'Простыня на резинке', 8],
      ['towel_big', 'Полотенце Большое', 45],
      ['towel_small', 'Полотенце Маленькое', 60]
    ];

    for (const l of initialLaundry) {
      await run(`
        INSERT INTO laundry_stock (item_name, display_name, quantity)
        VALUES (?, ?, ?)
      `, l);
    }
  }

  const techCount = await queryOne('SELECT COUNT(*) as count FROM tech_requests');
  if (techCount.count === 0) {
    console.log('Seeding initial tech requests...');
    const initialTech = [
      [104, 'housekeeping', 'Дополнительные полотенца (4 шт.) и халат для гостя.', 'urgent', 'pending', new Date().toISOString()],
      [212, 'maintenance', 'Перегорела лампа в прихожей. Требуется замена.', 'urgent', 'pending', new Date().toISOString()],
      [88, 'maintenance', 'Сломана ручка балконной двери. Не закрывается до конца.', 'normal', 'pending', new Date().toISOString()],
      [115, 'maintenance', 'Подтекает кран в ванной комнате (второй этаж).', 'normal', 'pending', new Date().toISOString()]
    ];

    for (const t of initialTech) {
      await run(`
        INSERT INTO tech_requests (cottage_number, category, description, urgency, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `, t);
    }
  }

  const purchaseCount = await queryOne('SELECT COUNT(*) as count FROM purchases');
  if (purchaseCount.count === 0) {
    console.log('Seeding initial purchases...');
    const initialPurchases = [
      ['Туалетная бумага 3-слойная', 20, 'urgent', 'pending', new Date().toISOString()],
      ['Мешки для мусора 60л', 10, 'normal', 'pending', new Date().toISOString()]
    ];

    for (const p of initialPurchases) {
      await run(`
        INSERT INTO purchases (item_name, quantity, urgency, status, created_at)
        VALUES (?, ?, ?, ?, ?)
      `, p);
    }
  }
}
