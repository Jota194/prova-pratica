const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { Worker } = require('node:worker_threads');

process.env.DB_PATH = path.join(__dirname, '..', 'data', 'test-forca-foco.db');

const { resetDatabase } = require('../src/db');
const { createSession, createReservation, cancelReservation, getPublicSessions } = require('../src/bookingService');

function setup() {
  resetDatabase();
}

test('cria sessão e reserva dentro da capacidade', () => {
  setup();

  const session = createSession({ name: 'HIIT Teste', date: '2030-01-10', time: '18:00', capacity: 2 });
  const reservation = createReservation({ studentName: 'João da Silva', sessionId: session.id });
  const savedSession = getPublicSessions().find((item) => item.id === session.id);

  assert.equal(reservation.session_name, 'HIIT Teste');
  assert.equal(reservation.student_name, 'João da Silva');
  assert.equal(savedSession.remaining, 1);
});

test('não permite duplicidade para o mesmo aluno na mesma sessão', () => {
  setup();

  const session = createSession({ name: 'CrossFit Teste', date: '2030-01-11', time: '19:00', capacity: 5 });
  createReservation({ studentName: 'Maria Souza', sessionId: session.id });

  assert.throws(() => {
    createReservation({ studentName: 'Maria Souza', sessionId: session.id });
  }, /Já possui uma reserva ativa/i);
});

test('bloqueia superlotação em concorrência', async () => {
  setup();

  const session = createSession({ name: 'WOD Concorrecia', date: '2030-01-12', time: '17:00', capacity: 2 });
  const workerPath = path.join(__dirname, 'concurrency-worker.js');

  const workers = ['Aluno 1', 'Aluno 2', 'Aluno 3', 'Aluno 4'].map((name) => {
    return new Worker(workerPath, {
      workerData: {
        dbPath: process.env.DB_PATH,
        sessionId: session.id,
        studentName: name,
      },
    });
  });

  const results = await Promise.all(workers.map((worker) => {
    return new Promise((resolve) => {
      worker.on('message', resolve);
      worker.on('error', (error) => resolve({ ok: false, error: error.message }));
    });
  }));

  const successful = results.filter((entry) => entry.ok).length;
  const finalSession = getPublicSessions().find((item) => item.id === session.id);

  assert.ok(successful <= 2, 'A capacidade não pode ser ultrapassada sob concorrência.');
  assert.equal(finalSession.occupancy, 2);
});

test('cancelamento libera vaga corretamente', () => {
  setup();

  const session = createSession({ name: 'Mobility Teste', date: '2030-01-13', time: '20:00', capacity: 1 });
  const reservation = createReservation({ studentName: 'Lucas Lima', sessionId: session.id });

  cancelReservation(reservation.id);

  const updatedSession = getPublicSessions().find((item) => item.id === session.id);
  assert.equal(updatedSession.remaining, 1);
});
