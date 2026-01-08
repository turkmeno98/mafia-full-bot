const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { Telegraf } = require('telegraf');

const app = express();
app.use(express.static('public'));
app.use(express.json());

const server = http.createServer(app);
const io = socketIo(server, { 
  cors: { origin: ['https://t.me', '*'], methods: ['GET', 'POST'] } 
});

const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) throw new Error('BOT_TOKEN required');
const bot = new Telegraf(TOKEN);

let games = {};  // {chatId: {players: [], alive: new Set(), phase: 'lobby', roles: []}}

console.log('🚀 Mafia Bot starting...');

// Socket.io для Mini App
io.on('connection', (socket) => {
  console.log('Mini App connected:', socket.id);
  socket.on('joinRoom', ({ roomId, userId, username }) => {
    if (!games[roomId]) {
      games[roomId] = { players: [], alive: new Set(), phase: 'lobby', roles: [], day: 1 };
    }
    const player = { id: userId, username };
    if (!games[roomId].players.some(p => p.id === userId)) {
      games[roomId].players.push(player);
      games[roomId].alive.add(userId);
    }
    io.to(roomId).emit('updatePlayers', {
      players: games[roomId].players,
      count: games[roomId].players.length
    });
    console.log(`Player ${username} joined ${roomId}`);
  });

  socket.on('startGame', (roomId) => {
    const game = games[roomId];
    if (game.phase !== 'lobby' || game.players.length < 4) return;
    
    // Раздача ролей (пример: 2 мафии, 1 доктор, 1 шериф)
    const roles = ['mafia', 'mafia', 'doctor', 'sheriff'];
    while (roles.length < game.players.length) roles.push('civilian');
    roles.sort(() => Math.random() - 0.5);
    game.roles = roles;
    game.players.forEach((p, i) => p.role = game.roles[i]);
    
    game.phase = 'night';
    game.day = 1;
    bot.telegram.sendMessage(roomId, `🎮 ИГРА НАЧАЛАСЬ! День ${game.day}\n🌙 НОЧЬ (30 сек). Мафия/доктор/шериф — действуйте в Mini App!`);
    io.to(roomId).emit('gameStart', { phase: 'night', role: game.players.find(p => p.id === socket.userId)?.role });
    
    setTimeout(() => nextPhase(roomId, io, bot), 30000);
  });

  socket.on('action', ({ roomId, action }) => {
    console.log(`Action in ${roomId}: ${action}`);
    // Логика убийств/лечения (упрощённо)
    bot.telegram.sendMessage(roomId, `⚡ Действие выполнено: ${action}`);
  });
});

function nextPhase(roomId, io, bot) {
  const game = games[roomId];
  if (!game) return;
  
  game.phase = game.phase === 'night' ? 'day' : 'night';
  if (game.phase === 'day') game.day++;
  
  const msg = game.phase === 'night' ? 
    `🌙 НОЧЬ День ${game.day} (30 сек)` : 
    `☀️ ДЕНЬ ${game.day}! Обсуждайте и голосуйте /vote @user (60 сек)`;
  
  bot.telegram.sendMessage(roomId, msg);
  io.to(roomId).emit('nextPhase', { phase: game.phase });
  
  setTimeout(() => nextPhase(roomId, io, bot), game.phase === 'night' ? 30000 : 60000);
}

// Telegraf bot handlers
bot.start((ctx) => {
  ctx.reply('🎮 Мафия Full! Добавь в группу админом.\n/start_game — запуск лобби\nВсе жмут кнопку Mini App снизу.');
});

bot.command('start_game', (ctx) => {
  const chatId = ctx.chat.id.toString();
  games[chatId] = { players: [], alive: new Set(), phase: 'lobby', roles: [], day: 1 };
  ctx.reply('🟢 ЛОББИ ОТКРЫТО! Приглашайте 4-12 игроков в Mini App (кнопка снизу)');
});

bot.command('end_game', (ctx) => {
  delete games[ctx.chat.id.toString()];
  ctx.reply('❌ Игра завершена');
});

// Модерация: удаляем сообщения неигроков/мёртвых
bot.on('message', async (ctx) => {
  const chatId = ctx.chat.id.toString();
  if (!games[chatId] || games[chatId].phase === 'lobby') return;
  
  const userId = ctx.from.id;
  const game = games[chatId];
  const player = game.players.find(p => p.id === userId);
  
  if (!player || !game.alive.has(userId)) {
    try {
      await ctx.deleteMessage();
      await ctx.reply(`💀 ${ctx.from.username} не играет или мёртв! Фокус на игре!`, { reply_to_message_id: ctx.message_id });
    } catch (e) {
      console.log('Delete failed:', e.message);
    }
  }
});

bot.launch().then(() => console.log('Bot polling started'));

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server on port ${process.env.PORT || 3000}`);
});
