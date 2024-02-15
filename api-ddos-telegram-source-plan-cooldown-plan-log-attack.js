const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Ganti dengan token bot Anda
const bot = new TelegramBot('token bot telegram', {polling: true});

// Menampilkan informasi penggunaan untuk /ci saja
const usageMessage = 'Gunakan /ci host port time method untuk menjalankan perintah tertentu. Contoh: /ci https://example.com 60 HTTP-FREE GET';

// Objek untuk menyimpan plan yang diizinkan dengan informasi kadaluarsa
const allowedPlans = {
  '@perkicau': { plan: 'basic', expires: '1d' },      // 1 day
  '@userVIP': { plan: 'vip', expires: '1d' },          // 1 day
  '@userPremium': { plan: 'premium', expires: '1d' },  // 1 day
};

// Objek untuk menyimpan waktu terakhir pengguna menjalankan perintah
const lastExecutionTime = {};

// Objek untuk menyimpan cooldown untuk setiap plan
const cooldowns = {
  'basic': 120,    // Cooldown dalam detik
  'vip': 300,      // Cooldown dalam detik
  'premium': 600,  // Cooldown dalam detik
  // Tambahkan plan dan cooldown sesuai kebutuhan
};

// Objek untuk menyimpan batas concurrency untuk setiap plan
const concurrencyLimits = {
  'basic': 1,
  'vip': 3,
  'premium': 6,
  // Tambahkan plan dan batas concurrency sesuai kebutuhan
};

// Objek untuk menyimpan jumlah permintaan bersamaan yang sedang berlangsung untuk setiap user
const concurrentRequests = {};

// Fungsi untuk menambahkan hari pada tanggal
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Fungsi untuk memeriksa apakah plan masih berlaku
function isPlanExpired(username) {
  const expirationString = allowedPlans[username].expires;
  if (!expirationString) {
    // Plan tidak memiliki batas waktu, selalu dianggap berlaku
    return false;
  }

  const expirationDate = new Date(expirationString);
  const currentTime = new Date();

  return currentTime > expirationDate;
}

// Fungsi untuk memeriksa apakah batas concurrency tercapai
function isConcurrencyLimitReached(username) {
  const userPlan = allowedPlans[username].plan;
  const currentConcurrent = concurrentRequests[username] || 0;
  const concurrencyLimit = concurrencyLimits[userPlan] || 0;

  return currentConcurrent >= concurrencyLimit;
}

// Fungsi untuk menampilkan informasi plan
bot.onText(/\/plan/, (msg) => {
  const chatId = msg.chat.id;
  const username = `@${msg.from.username}`;

  // Cek apakah pengguna memiliki plan
  const userPlan = allowedPlans[username] ? allowedPlans[username].plan : null;

  if (!userPlan) {
    // Pengguna tidak memiliki plan
    const noPlanMessage = `Anda tidak memiliki plan saat ini. Harap hubungi @perkicau.`;
    bot.sendMessage(chatId, noPlanMessage);
    return;
  }

  // Pengguna memiliki plan, ambil informasi tambahan
  const planInfo = allowedPlans[username];
  const expirationDate = planInfo.expires ? planInfo.expires.toISOString() : 'Tidak Diketahui';
  const concurrents = concurrentRequests[username] || 0;
  const cooldown = cooldowns[userPlan] || 0;

  // Kirim informasi plan
  const planMessage = `
Nama: ${msg.from.first_name} ${msg.from.last_name || ''}
Plan: ${userPlan}
Expired Plan: ${expirationDate}
Concurrents: ${concurrents}
Cooldown: ${cooldown} detik
  `;

  bot.sendMessage(chatId, planMessage);
});

// Command /methods
bot.onText(/\/methods/, (msg) => {
  const chatId = msg.chat.id;

  const methodsMessage = `
Method yang kami punya:
- TEST (Available for: basic, vip, premium)
- TEST1 (Available for: basic)
- TEST2 (Available for: basic)
  `;
  bot.sendMessage(chatId, methodsMessage);
});

// Command /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const ownerUsername = '@perkicau';

  const welcomeMessage = `
Selamat datang di bot kami!
Owner: ${ownerUsername}
Method Yang Kami Punya:
- TEST
- TEST1
- TEST2

Untuk Menggunakan: ${usageMessage}
  `;
  bot.sendMessage(chatId, welcomeMessage);
});

// Command /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, usageMessage);
});

// Command /ci
bot.onText(/\/ci (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const username = `@${msg.from.username}`;  // Mendapatkan username pengguna yang menjalankan perintah
  const commandArguments = match[1].split(' ');

  // Cek apakah jumlah argumen sesuai
  if (commandArguments.length !== 4) {
    bot.sendMessage(chatId, usageMessage);
    return;
  }

  // Cek apakah pengguna memiliki plan yang benar
  const userPlan = allowedPlans[username] ? allowedPlans[username].plan : null;
  if (!userPlan) {
    // Pengguna tidak memiliki plan
    const noPlanMessage = `Anda tidak memiliki plan saat ini. Harap hubungi @perkicau.`;
    bot.sendMessage(chatId, noPlanMessage);
    return;
  }

  // Cek apakah pengguna memiliki akses ke method tertentu
  const requestedMethod = commandArguments[3];
  if (!allowedMethods[userPlan] || !allowedMethods[userPlan].includes(requestedMethod)) {
    // Pengguna tidak memiliki izin untuk method ini
    const upgradeMessage = `Plan Anda adalah ${userPlan}. Jika Anda ingin memperbarui plan untuk mengakses method ${requestedMethod}, harap hubungi @perkicau.`;
    bot.sendMessage(chatId, upgradeMessage);
    return;
  }

  // Cek apakah batas concurrency tercapai
  if (isConcurrencyLimitReached(username)) {
    bot.sendMessage(chatId, `Batas concurrency untuk plan ${userPlan} telah tercapai. Harap coba lagi nanti.`);
    return;
  }

  // Cek apakah masih dalam cooldown
  const currentTime = new Date();
  const lastExecution = lastExecutionTime[username] || new Date(0);
  const cooldown = cooldowns[userPlan] || 0;

  if (currentTime - lastExecution < cooldown * 1000) {
    bot.sendMessage(chatId, `Masih dalam cooldown. Harap tunggu hingga cooldown berakhir.`);
    return;
  }

  // Update waktu terakhir pengguna menjalankan perintah
  lastExecutionTime[username] = currentTime;

  // Tambah jumlah permintaan bersamaan yang sedang berlangsung untuk user
  concurrentRequests[username] = (concurrentRequests[username] || 0) + 1;

  const host = commandArguments[0];
  const port = commandArguments[1];
  const time = commandArguments[2];
  const method = commandArguments[3];

  const apiUrl = `https://api.ok.cat/start?api_key=ok&user=ok&target=${host}${port}&time=${time}&method=${method}&requestmethod=${method}`;

  // Log ke console username pengguna yang menjalankan perintah
  console.log(`Command /ci executed by user ${username} with plan ${userPlan} in chat ${chatId}`);

  // Kirim permintaan ke API
  axios.get(apiUrl)
    .then(response => {
      // Kurangi jumlah permintaan bersamaan yang sedang berlangsung untuk user
      concurrentRequests[username] = Math.max(0, (concurrentRequests[username] || 0) - 1);

      // Kirim pesan ke pengguna setelah permintaan berhasil
      const successMessage = `Success!\nHost: ${host}:${port}\nTime: ${time}s\nMethod: ${method}\nRequest Method: ${method}`;
      bot.sendMessage(chatId, successMessage);
    })
    .catch(error => {
      // Kurangi jumlah permintaan bersamaan yang sedang berlangsung untuk user
      concurrentRequests[username] = Math.max(0, (concurrentRequests[username] || 0) - 1);

      // Tangani kesalahan jika ada
      console.error('Error:', error);
      bot.sendMessage(chatId, 'Error occurred while processing the request.');
    });
});
