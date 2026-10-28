const { parentPort, workerData } = require('node:worker_threads');
process.env.DB_PATH = workerData.dbPath;

const { createReservation } = require('../src/bookingService');

try {
  const reservation = createReservation({
    studentName: workerData.studentName,
    sessionId: workerData.sessionId,
  });

  parentPort.postMessage({ ok: true, reservationId: reservation.id, studentName: workerData.studentName });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message, studentName: workerData.studentName });
}
