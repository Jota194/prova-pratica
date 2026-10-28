const { db } = require('./db');

function calcSessionStatus(session) {
  const activeReservations = Number(session.active_count || 0);
  const remaining = Number(session.capacity) - activeReservations;
  if (session.status === 'closed') return { status: 'encerrada', remaining, occupancy: activeReservations };
  if (remaining <= 0) return { status: 'lotada', remaining: 0, occupancy: activeReservations };
  return { status: 'disponível', remaining, occupancy: activeReservations };
}

function transformSession(row) {
  const summary = calcSessionStatus(row);
  return {
    ...row,
    capacity: Number(row.capacity),
    active_count: Number(row.active_count || 0),
    remaining: summary.remaining,
    status_label: summary.status,
    occupancy: summary.occupancy,
  };
}

function getPublicSessions() {
  const rows = db.prepare(`
    SELECT s.*, COUNT(r.id) AS active_count
    FROM sessions s
    LEFT JOIN reservations r ON r.session_id = s.id AND r.status = 'confirmed'
    GROUP BY s.id
    ORDER BY s.date, s.time
  `).all();

  return rows.map(transformSession);
}

function listSessions() {
  return getPublicSessions();
}

function getSessionById(sessionId) {
  const row = db.prepare(`
    SELECT s.*, COUNT(r.id) AS active_count
    FROM sessions s
    LEFT JOIN reservations r ON r.session_id = s.id AND r.status = 'confirmed'
    WHERE s.id = ?
    GROUP BY s.id
  `).get(Number(sessionId));

  return row ? transformSession(row) : null;
}

function getReservationsForSession(sessionId) {
  return db.prepare(`
    SELECT *
    FROM reservations
    WHERE session_id = ?
    ORDER BY created_at DESC
  `).all(Number(sessionId));
}

function getReservationsByName(searchTerm) {
  const value = (searchTerm || '').trim();
  if (!value) {
    return [];
  }

  const likeValue = `%${value.toLowerCase()}%`;
  return db.prepare(`
    SELECT r.*, s.name AS session_name, s.date, s.time
    FROM reservations r
    INNER JOIN sessions s ON s.id = r.session_id
    WHERE lower(r.student_name) LIKE ?
    ORDER BY r.created_at DESC
  `).all(likeValue);
}

function createSession(input) {
  const name = String(input.name || '').trim();
  const date = String(input.date || '').trim();
  const time = String(input.time || '').trim();
  const capacity = Number(input.capacity || 0);

  if (!name || !date || !time || capacity <= 0) {
    throw new Error('Informe nome, data, horário e capacidade válidos.');
  }

  const statement = db.prepare(`
    INSERT INTO sessions (name, date, time, capacity, status)
    VALUES (@name, @date, @time, @capacity, @status)
  `);

  const result = statement.run({
    name,
    date,
    time,
    capacity,
    status: 'open',
  });

  return getSessionById(result.lastInsertRowid);
}

function updateSession(sessionId, input) {
  const id = Number(sessionId);
  const name = String(input.name || '').trim();
  const date = String(input.date || '').trim();
  const time = String(input.time || '').trim();
  const capacity = Number(input.capacity || 0);

  if (!id || !name || !date || !time || capacity <= 0) {
    throw new Error('Informe nome, data, horário e capacidade válidos.');
  }

  const existing = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!existing) {
    throw new Error('Sessão não encontrada.');
  }

  db.prepare(`
    UPDATE sessions
    SET name = @name, date = @date, time = @time, capacity = @capacity
    WHERE id = @id
  `).run({ id, name, date, time, capacity });

  return getSessionById(id);
}

function createReservation({ studentName, sessionId }) {
  const name = String(studentName || '').trim();
  const sessionIdNumber = Number(sessionId);

  if (!name) {
    throw new Error('Nome completo do aluno é obrigatório.');
  }

  if (!sessionIdNumber || Number.isNaN(sessionIdNumber)) {
    throw new Error('Sessão inválida.');
  }

  const studentKey = name.toLowerCase();

  const res = db.transaction(() => {
    const session = db.prepare(`
      SELECT s.*, COUNT(r.id) AS active_count
      FROM sessions s
      LEFT JOIN reservations r ON r.session_id = s.id AND r.status = 'confirmed'
      WHERE s.id = ?
      GROUP BY s.id
    `).get(sessionIdNumber);

    if (!session) {
      throw new Error('Sessão inexistente.');
    }

    if (session.status !== 'open') {
      throw new Error('Esta sessão está encerrada e não aceita novas reservas.');
    }

    const duplicate = db.prepare(`
      SELECT id
      FROM reservations
      WHERE session_id = ? AND student_key = ? AND status = 'confirmed'
    `).get(sessionIdNumber, studentKey);

    if (duplicate) {
      throw new Error('Você já possui uma reserva ativa para esta sessão.');
    }

    const occupied = Number(session.active_count || 0);
    const capacity = Number(session.capacity);

    if (occupied >= capacity) {
      throw new Error('Turma lotada. Não há vagas disponíveis nesta sessão.');
    }

    const result = db.prepare(`
      INSERT INTO reservations (session_id, student_name, student_key, status, created_at)
      VALUES (@sessionId, @studentName, @studentKey, 'confirmed', datetime('now'))
    `).run({
      sessionId: sessionIdNumber,
      studentName: name,
      studentKey,
    });

    return db.prepare(`
      SELECT r.*, s.name AS session_name, s.date, s.time, s.capacity
      FROM reservations r
      INNER JOIN sessions s ON s.id = r.session_id
      WHERE r.id = ?
    `).get(result.lastInsertRowid);
  })();

  return res;
}

function cancelReservation(reservationId) {
  const id = Number(reservationId);
  if (!id) {
    throw new Error('Reserva inválida.');
  }

  const reservation = db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
  if (!reservation) {
    throw new Error('Reserva não encontrada.');
  }

  if (reservation.status !== 'confirmed') {
    throw new Error('Esta reserva já foi cancelada.');
  }

  db.prepare(`
    UPDATE reservations
    SET status = 'cancelled', canceled_at = datetime('now')
    WHERE id = ?
  `).run(id);

  return db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
}

function getDashboardSummary() {
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS total_sessions,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_sessions,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_sessions,
      COALESCE(SUM(capacity), 0) AS total_capacity,
      COALESCE(SUM((SELECT COUNT(*) FROM reservations r WHERE r.session_id = s.id AND r.status = 'confirmed')), 0) AS occupied_seats,
      COALESCE(SUM(CASE WHEN (SELECT COUNT(*) FROM reservations r WHERE r.session_id = s.id AND r.status = 'confirmed') >= capacity THEN 1 ELSE 0 END), 0) AS full_sessions
    FROM sessions s
  `).get();

  const activeReservations = db.prepare(`
    SELECT COUNT(*) AS total
    FROM reservations
    WHERE status = 'confirmed'
  `).get().total;

  const cancelledReservations = db.prepare(`
    SELECT COUNT(*) AS total
    FROM reservations
    WHERE status = 'cancelled'
  `).get().total;

  return {
    total_sessions: Number(totals.total_sessions || 0),
    open_sessions: Number(totals.open_sessions || 0),
    closed_sessions: Number(totals.closed_sessions || 0),
    total_capacity: Number(totals.total_capacity || 0),
    occupied_seats: Number(activeReservations || 0),
    full_sessions: Number(totals.full_sessions || 0),
    cancelled_reservations: Number(cancelledReservations || 0),
  };
}

module.exports = {
  createReservation,
  createSession,
  cancelReservation,
  getDashboardSummary,
  getPublicSessions,
  getReservationsByName,
  getReservationsForSession,
  listSessions,
  getSessionById,
  updateSession,
};
