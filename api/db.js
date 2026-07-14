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
      laundry_config TEXT,
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

  // Таблица горничных (персонала)
  await run(`
    CREATE TABLE IF NOT EXISTS maids (
      id ${serialType},
      name TEXT NOT NULL,
      telegram_username TEXT
    )
  `);
}

// Первичное наполнение тестовыми данными
async function seedInitialData() {
  const cottageCount = await queryOne('SELECT COUNT(*) as count FROM cottages');
  if (cottageCount.count === 0) {
    console.log('Seeding initial cottages...');
    const initialCottages = [
      [1, 'Домик 1', 'уборка не требуется', 1, 'green', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [2, 'Домик 2', 'уборка не требуется', 2, 'green', 1, 1, 0, 0, 1, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [3, 'Домик 3', 'уборка не требуется', 3, 'green', 2, 0, 0, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [4, 'Домик 4', 'уборка не требуется', 4, 'green', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [5, 'Домик 5', 'уборка не требуется', 5, 'green', 0, 1, 2, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [6, 'Домик 6', 'уборка не требуется', 6, 'green', 1, 0, 0, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [7, 'Домик 7', 'уборка не требуется', 7, 'green', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [8, 'Домик 8', 'уборка не требуется', 8, 'green', 1, 1, 0, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [9, 'Домик 9', 'уборка не требуется', 9, 'green', 2, 0, 0, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [10, 'Домик 10', 'уборка не требуется', 10, 'green', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [11, 'Домик 11', 'уборка не требуется', 11, 'green', 0, 1, 2, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [12, 'Домик 12', 'уборка не требуется', 12, 'green', 1, 0, 0, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [13, 'Домик 13', 'уборка не требуется', 13, 'green', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [14, 'Домик 14', 'уборка не требуется', 14, 'green', 1, 1, 0, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [15, 'Домик 15', 'уборка не требуется', 15, 'green', 2, 0, 0, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [16, 'Домик 16', 'уборка не требуется', 16, 'green', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [17, 'Домик 17', 'уборка не требуется', 17, 'green', 0, 1, 2, 0, 1, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [18, 'Домик 18', 'уборка не требуется', 18, 'green', 1, 0, 0, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [19, 'Домик 19', 'уборка не требуется', 19, 'green', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [20, 'Домик 20', 'уборка не требуется', 20, 'green', 1, 1, 0, 0, 1, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [21, 'Домик 21', 'уборка не требуется', 21, 'green', 2, 0, 0, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [22, 'Домик 22', 'уборка не требуется', 22, 'green', 1, 0, 2, 1, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, ''],
      [23, 'Домик 23', 'уборка не требуется', 23, 'green', 0, 1, 2, 0, 0, '', '["Пыль","Постельное белье","Вынос мусора","Полотенца"]', '[]', '', 0, '']
    ];

    for (const c of initialCottages) {
      const bedsBig = c[5];
      const bedsMed = c[6];
      const bedsSmall = c[7];
      const bedsElastic = c[8];
      
      const config = {};
      if (bedsBig > 0) {
        config['sheet_big'] = bedsBig;
        config['towel_big'] = bedsBig * 2;
      }
      if (bedsMed > 0) {
        config['sheet_medium'] = bedsMed;
        config['towel_big'] = (config['towel_big'] || 0) + bedsMed * 2;
      }
      if (bedsSmall > 0) {
        config['sheet_small'] = bedsSmall;
        config['towel_big'] = (config['towel_big'] || 0) + bedsSmall * 2;
      }
      if (bedsElastic > 0) {
        config['sheet_elastic'] = bedsElastic;
      }
      
      const laundryConfigStr = JSON.stringify(config);
      const params = [...c];
      params.push(laundryConfigStr);

      await run(`
        INSERT INTO cottages (number, name, type, priority, status, beds_big, beds_medium, beds_small, beds_elastic, stay_over_full, maid_id, checklist, checklist_done, maid_comment, rating_score, rating_comment, laundry_config)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, params);
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

  const maidCount = await queryOne('SELECT COUNT(*) as count FROM maids');
  if (maidCount.count === 0) {
    console.log('Seeding initial maids...');
    const initialMaids = [
      ['Мария Иванова', 'maria_clean'],
      ['Елена Петрова', 'elena_clean'],
      ['Анна Смирнова', 'anna_clean']
    ];

    for (const m of initialMaids) {
      await run(`
        INSERT INTO maids (name, telegram_username)
        VALUES (?, ?)
      `, m);
    }
  }
}
