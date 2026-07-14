import express from 'express';
import cors from 'cors';
import { Telegraf, Markup } from 'telegraf';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { initDb, query, queryOne, run } from './db.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const proxyUrl = process.env.PROXY_URL;
const webappUrl = process.env.WEBAPP_URL || 'https://cottage-care.vercel.app';

let bot;
let subscribers = [];
const subscribersFilePath = path.resolve('subscribers.json');

// Загрузка подписчиков
if (fs.existsSync(subscribersFilePath)) {
  try {
    subscribers = JSON.parse(fs.readFileSync(subscribersFilePath, 'utf8'));
  } catch (e) {
    console.error('Error reading subscribers file:', e);
  }
}

// Сохранение подписчиков
function saveSubscribers() {
  try {
    fs.writeFileSync(subscribersFilePath, JSON.stringify(subscribers), 'utf8');
  } catch (e) {
    console.error('Error saving subscribers file:', e);
  }
}

// Инициализация базы данных и запуск сервера
async function startServer() {
  try {
    await initDb();
    console.log('Database initialized successfully.');
  } catch (e) {
    console.error('Database initialization failed:', e);
  }

  // Настройка Telegram-бота
  if (botToken) {
    try {
      const botOptions = {};
      if (proxyUrl) {
        console.log('Using proxy for Telegram Bot:', proxyUrl);
        botOptions.telegram = {
          agent: new HttpsProxyAgent(proxyUrl)
        };
      }
      
      bot = new Telegraf(botToken, botOptions);
      
      bot.start((ctx) => {
        const chatId = ctx.chat.id;
        if (!subscribers.includes(chatId)) {
          subscribers.push(chatId);
          saveSubscribers();
        }
        
        ctx.reply(
          `Привет, ${ctx.from.first_name || 'пользователь'}! 👋\n\nЯ бот системы управления уборкой *Cottage Care*.\nЯ буду присылать тебе уведомления о завершенных уборках и технических заявках.\n\nНажми кнопку ниже, чтобы открыть панель управления!`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [Markup.button.webApp('Открыть Cottage Care 🧹', webappUrl)]
            ])
          }
        );
      });

      // Локальный запуск (long polling) или вебхуки для Vercel
      if (process.env.VERCEL) {
        console.log('Running on Vercel. Webhook will be configured.');
        app.post('/api/bot-webhook', (req, res) => {
          bot.handleUpdate(req.body, res);
        });
      } else {
        bot.launch().then(() => {
          console.log('Telegram Bot started in polling mode.');
        }).catch(err => {
          console.error('Failed to launch Telegram bot in polling mode:', err);
        });
      }
    } catch (e) {
      console.error('Failed to initialize Telegram Bot:', e);
    }
  } else {
    console.warn('TELEGRAM_BOT_TOKEN not provided. Telegram bot will not be active.');
  }

  // Маршрутизация статических файлов для локальной работы
  // В Vercel статика обслуживается самой платформой, но локально Express может отдавать index.html
  const publicPath = path.resolve();
  app.use(express.static(publicPath));
  
  // Домики API
  // 1. Получить список всех домиков
  app.get('/api/cottages', async (req, res) => {
    try {
      const cottages = await query('SELECT * FROM cottages ORDER BY priority ASC, number ASC');
      // Преобразуем checklist и checklist_done из строк в JSON массивы
      const formattedCottages = cottages.map(c => ({
        ...c,
        checklist: JSON.parse(c.checklist || '[]'),
        checklist_done: JSON.parse(c.checklist_done || '[]')
      }));
      res.json(formattedCottages);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 1.1 Добавить новый домик в редакторе
  app.post('/api/cottages', async (req, res) => {
    const { number, name, beds_big, beds_medium, beds_small, beds_elastic, stay_over_full, laundry_config } = req.body;
    const defaultChecklist = JSON.stringify(["Пыль","Постельное белье","Вынос мусора","Полотенца"]);
    try {
      await run(
        `INSERT INTO cottages (number, name, type, priority, status, beds_big, beds_medium, beds_small, beds_elastic, stay_over_full, checklist, checklist_done, maid_comment, laundry_config)
         VALUES (?, ?, 'уборка не требуется', ?, 'green', ?, ?, ?, ?, ?, ?, '[]', '', ?)`,
        [number, name, number, beds_big, beds_medium, beds_small, beds_elastic, stay_over_full, defaultChecklist, laundry_config || '{}']
      );
      res.json({ success: true, number });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 1.2 Изменить конфигурацию домика
  app.put('/api/cottages/:number/config', async (req, res) => {
    const { number } = req.params;
    const { name, beds_big, beds_medium, beds_small, beds_elastic, stay_over_full, laundry_config } = req.body;
    try {
      await run(
        `UPDATE cottages SET name = ?, beds_big = ?, beds_medium = ?, beds_small = ?, beds_elastic = ?, stay_over_full = ?, laundry_config = ? 
         WHERE number = ?`,
        [name, beds_big, beds_medium, beds_small, beds_elastic, stay_over_full, laundry_config || '{}', number]
      );
      res.json({ success: true, number });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 1.3 Удалить домик
  app.delete('/api/cottages/:number', async (req, res) => {
    const { number } = req.params;
    try {
      await run('DELETE FROM cottages WHERE number = ?', [number]);
      res.json({ success: true, number });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 1.4 Назначение плана уборки и горничной для домика
  app.put('/api/cottages/:number/assignment', async (req, res) => {
    const { number } = req.params;
    const { type, maid_id, priority, status } = req.body;
    try {
      await run(
        'UPDATE cottages SET type = ?, maid_id = ?, priority = ?, status = ? WHERE number = ?',
        [type, maid_id || null, priority, status, number]
      );
      res.json({ success: true, number });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Персонал (Горничные) API
  // 1. Получить список горничных
  app.get('/api/maids', async (req, res) => {
    try {
      const maids = await query('SELECT * FROM maids ORDER BY name ASC');
      res.json(maids);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Добавить горничную
  app.post('/api/maids', async (req, res) => {
    const { name, telegram_username } = req.body;
    try {
      const result = await run('INSERT INTO maids (name, telegram_username) VALUES (?, ?)', [name, telegram_username || '']);
      res.json({ success: true, id: result.lastInsertId, name, telegram_username });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Удалить горничную
  app.delete('/api/maids/:id', async (req, res) => {
    const { id } = req.params;
    try {
      await run('DELETE FROM maids WHERE id = ?', [id]);
      res.json({ success: true, id });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Обновить статус домика
  app.put('/api/cottages/:number/status', async (req, res) => {
    const { number } = req.params;
    const { status, maid_comment } = req.body;
    
    try {
      const oldCottage = await queryOne('SELECT status FROM cottages WHERE number = ?', [number]);
      if (!oldCottage) {
        return res.status(444).json({ error: 'Cottage not found' });
      }

      await run(
        'UPDATE cottages SET status = ?, maid_comment = COALESCE(?, maid_comment) WHERE number = ?', 
        [status, maid_comment || null, number]
      );

      // Отправка уведомления при смене статуса на "оранжевый" (Сделано горничной, ждет проверки)
      if (status === 'orange' && oldCottage.status !== 'orange') {
        sendTelegramNotification(`🧹 **Домик №${number}** убран горничной и ждет проверки!\n📝 Комментарий горничной: "${maid_comment || 'нет комментария'}"`);
      }

      res.json({ success: true, number, status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Обновить приоритеты (очередность уборок)
  app.put('/api/cottages/:number/priority', async (req, res) => {
    const { number } = req.params;
    const { priority } = req.body;
    try {
      await run('UPDATE cottages SET priority = ? WHERE number = ?', [priority, number]);
      res.json({ success: true, number, priority });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. Обновить чек-лист выполнения горничной
  app.put('/api/cottages/:number/checklist', async (req, res) => {
    const { number } = req.params;
    const { checklist_done } = req.body; // Массив выполненных пунктов
    try {
      const checklistStr = JSON.stringify(checklist_done);
      await run('UPDATE cottages SET checklist_done = ? WHERE number = ?', [checklistStr, number]);
      res.json({ success: true, number, checklist_done });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 5. Проверка уборки супервайзером (приемка)
  app.put('/api/cottages/:number/review', async (req, res) => {
    const { number } = req.params;
    const { score, comment } = req.body;
    try {
      // Меняем статус на зеленый (проверено), записываем оценку
      await run(
        'UPDATE cottages SET status = \'green\', rating_score = ?, rating_comment = ? WHERE number = ?',
        [score, comment, number]
      );
      
      // Логируем в историю оценок
      await run(
        'INSERT INTO quality_reviews (cottage_number, score, comments, date) VALUES (?, ?, ?, ?)',
        [number, score, comment, new Date().toISOString().split('T')[0]]
      );

      sendTelegramNotification(`✅ **Домик №${number}** успешно проверен супервайзером!\n⭐️ Оценка: ${score}/5\n💬 Комментарий: "${comment || 'без комментария'}"`);

      res.json({ success: true, number, status: 'green', score, comment });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 6. Добавить комментарий горничной
  app.put('/api/cottages/:number/maid_comment', async (req, res) => {
    const { number } = req.params;
    const { maid_comment } = req.body;
    try {
      await run('UPDATE cottages SET maid_comment = ? WHERE number = ?', [maid_comment, number]);
      res.json({ success: true, number, maid_comment });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Учет белья API
  // 1. Получить запасы белья и расчет потребностей
  app.get('/api/laundry', async (req, res) => {
    try {
      const stock = await query('SELECT * FROM laundry_stock');
      const cottages = await query('SELECT * FROM cottages');
      
      const needsToday = {};
      const needsTomorrow = {};
      stock.forEach(item => {
        needsToday[item.item_name] = 0;
        needsTomorrow[item.item_name] = 0;
      });

      cottages.forEach(c => {
        const isCheckout = c.type === 'выезд' || c.type === 'выезд+заезд';
        const isStayOver = c.type === 'промежуточная';
        const config = JSON.parse(c.laundry_config || '{}');

        if (c.status !== 'green') {
          if (isCheckout) {
            Object.keys(config).forEach(item => {
              if (needsToday[item] !== undefined) {
                needsToday[item] += parseInt(config[item] || 0);
              }
            });
          } else if (isStayOver) {
            Object.keys(config).forEach(item => {
              if (needsToday[item] !== undefined) {
                if (c.stay_over_full === 1 || item.includes('towel')) {
                  needsToday[item] += parseInt(config[item] || 0);
                }
              }
            });
          }
        }

        // Завтрашняя потребность
        if (isCheckout) {
          Object.keys(config).forEach(item => {
            if (needsTomorrow[item] !== undefined) {
              needsTomorrow[item] += parseInt(config[item] || 0);
            }
          });
        } else if (isStayOver) {
          Object.keys(config).forEach(item => {
            if (needsTomorrow[item] !== undefined) {
              if (item.includes('towel')) {
                needsTomorrow[item] += parseInt(config[item] || 0);
              }
            }
          });
        }
      });

      res.json({
        stock,
        needsToday,
        needsTomorrow
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Обновить количество белья на складе
  app.put('/api/laundry/stock', async (req, res) => {
    const { stock } = req.body;
    try {
      for (const item of stock) {
        await run('UPDATE laundry_stock SET quantity = ? WHERE item_name = ?', [item.quantity, item.item_name]);
      }
      res.json({ success: true, stock });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Добавить новую категорию белья
  app.post('/api/laundry', async (req, res) => {
    const { item_name, display_name, quantity } = req.body;
    try {
      await run(
        'INSERT INTO laundry_stock (item_name, display_name, quantity) VALUES (?, ?, ?)',
        [item_name, display_name, quantity || 0]
      );
      res.json({ success: true, item_name, display_name, quantity });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. Удалить категорию белья
  app.delete('/api/laundry/:item_name', async (req, res) => {
    const { item_name } = req.params;
    try {
      await run('DELETE FROM laundry_stock WHERE item_name = ?', [item_name]);
      res.json({ success: true, item_name });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Технические заявки API
  // 1. Получить список всех заявок
  app.get('/api/requests', async (req, res) => {
    try {
      const requests = await query('SELECT * FROM tech_requests ORDER BY created_at DESC');
      res.json(requests);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Создать новую заявку
  app.post('/api/requests', async (req, res) => {
    const { cottage_number, category, description, urgency } = req.body;
    try {
      const created_at = new Date().toISOString();
      const result = await run(
        'INSERT INTO tech_requests (cottage_number, category, description, urgency, status, created_at) VALUES (?, ?, ?, ?, \'pending\', ?)',
        [cottage_number, category, description, urgency, created_at]
      );
      
      const textUrgency = urgency === 'urgent' ? '🚨 СРОЧНО' : '⚙️ Ремонт';
      sendTelegramNotification(`${textUrgency} **Заявка по домику №${cottage_number}**:\n"${description}"\nКатегория: ${category}`);

      res.json({ success: true, id: result.lastInsertId, cottage_number, category, description, urgency, status: 'pending', created_at });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Изменить статус заявки (переключить выполнение)
  app.put('/api/requests/:id/toggle', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'pending' -> 'sent_to_tech' -> 'done'
    try {
      await run('UPDATE tech_requests SET status = ? WHERE id = ?', [status, id]);
      const reqInfo = await queryOne('SELECT * FROM tech_requests WHERE id = ?', [id]);
      
      let statusText = 'В очереди';
      if (status === 'sent_to_tech') statusText = 'Передано техникам 🛠';
      if (status === 'done') statusText = 'Выполнено ✅';

      if (reqInfo) {
        sendTelegramNotification(`⚙️ Статус заявки по **домику №${reqInfo.cottage_number}** изменен:\n"${reqInfo.description}"\nНовый статус: **${statusText}**`);
      }

      res.json({ success: true, id, status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Контроль качества & Отчетность
  app.get('/api/reports', async (req, res) => {
    try {
      const reviews = await query('SELECT * FROM quality_reviews ORDER BY date DESC LIMIT 50');
      
      // Расчет агрегированной аналитики
      const stats = await queryOne(`
        SELECT 
          COUNT(*) as total_cleanings,
          AVG(score) as avg_score
        FROM quality_reviews
      `);

      // Извлекаем повторяющиеся ошибки (для демонстрации сгруппируем по комментариям)
      // В реальной системе здесь был бы семантический анализ или тегирование косяков
      const commonIssues = await query(`
        SELECT comments, COUNT(*) as count 
        FROM quality_reviews 
        WHERE score < 5 AND comments IS NOT NULL AND comments != ''
        GROUP BY comments 
        ORDER BY count DESC 
        LIMIT 5
      `);

      res.json({
        reviews,
        stats: {
          total_cleanings: stats?.total_cleanings || 0,
          avg_score: stats?.avg_score ? parseFloat(stats.avg_score.toFixed(1)) : 0
        },
        commonIssues
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Закупки API
  // 1. Получить закупки
  app.get('/api/purchases', async (req, res) => {
    try {
      const purchases = await query('SELECT * FROM purchases ORDER BY urgency DESC, created_at DESC');
      res.json(purchases);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 2. Добавить позицию в закупки
  app.post('/api/purchases', async (req, res) => {
    const { item_name, quantity, urgency } = req.body;
    try {
      const created_at = new Date().toISOString();
      const result = await run(
        'INSERT INTO purchases (item_name, quantity, urgency, status, created_at) VALUES (?, ?, ?, \'pending\', ?)',
        [item_name, quantity, urgency, created_at]
      );
      res.json({ success: true, id: result.lastInsertId, item_name, quantity, urgency, status: 'pending', created_at });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 3. Обновить статус закупки
  app.put('/api/purchases/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    try {
      await run('UPDATE purchases SET status = ? WHERE id = ?', [status, id]);
      res.json({ success: true, id, status });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // 4. Очистить купленные позиции
  app.delete('/api/purchases', async (req, res) => {
    try {
      await run('DELETE FROM purchases WHERE status = \'purchased\'');
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Запуск прослушивания порта
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Рассылка уведомлений подписчикам в Telegram
function sendTelegramNotification(message) {
  if (!bot) return;
  
  subscribers.forEach(chatId => {
    bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' }).catch(err => {
      console.error(`Failed to send message to chat ${chatId}:`, err.message);
      // Если бот заблокирован пользователем, удаляем его из списка
      if (err.code === 403) {
        subscribers = subscribers.filter(id => id !== chatId);
        saveSubscribers();
      }
    });
  });
}

// Экспорт по умолчанию для Vercel Serverless
startServer();

export default app;
