const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

app.use(express.static('public')); // Для Mini App файлов
app.use(express.json());

let games = {}; // {roomId: {players: [], phase: 'lobby', roles: [], timer: null}}

io.on('connection', (socket) => {
  socket.on('joinRoom', ({ roomId, userId, username }) => {
    if (!games[roomId]) games[roomId] = { players: [], phase: 'lobby', roles: [], day: 1 };
    const player = { id: userId, username, alive: true, role: null };
    games[roomId].players.push(player);
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', games[roomId].players);
  });

  socket.on('startGame', (roomId) => {
    const game = games[roomId];
    if (game.players.length >= 4 && game.phase === 'lobby') {
      // Раздать роли: мафия 25%, доктор/шериф 1 каждый
      const roles = ['mafia', 'mafia', 'doctor', 'sheriff', ...Array(game.players.length - 4).fill('civilian')];
      game.roles = roles.sort(() => Math.random() - 0.5);
      game.players.forEach((p, i) => p.role = game.roles[i]);
      game.phase = 'night';
      io.to(roomId).emit('gameStart', { phase: 'night', roles: game.players.map(p => ({username: p.username, role: p.role})) });
      setTimeout(() => nextPhase(roomId), 30000); // 30 сек ночь
    }
  });

  socket.on('action', ({ roomId, action }) => {
    // Логика: mafia kill, doctor heal, sheriff check
    io.to(roomId).emit('actionReceived', action);
  });

  socket.on('vote', ({ roomId, targetId }) => {
    // Голосование днём
  });
});

function nextPhase(roomId) {
  const game = games[roomId];
  // Убить по мафии, объявить, голосование, etc. Упрости для примера
  game.phase = game.phase === 'night' ? 'day' : 'night';
  io.to(roomId).emit('nextPhase', game.phase);
  games[roomId].timer = setTimeout(() => nextPhase(roomId), 30000);
}

server.listen(process.env.PORT || 3000);
