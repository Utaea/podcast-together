CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  owner_nonce TEXT NOT NULL,
  o_state TEXT NOT NULL,
  play_status TEXT NOT NULL,
  speed_rate TEXT NOT NULL,
  content_stamp INTEGER NOT NULL,
  operate_stamp INTEGER NOT NULL,
  operator_guest_id TEXT NOT NULL,
  create_stamp INTEGER NOT NULL,
  config_everyone_can_operate TEXT NOT NULL,
  content_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS room_participants (
  room_id TEXT NOT NULL,
  nonce TEXT NOT NULL,
  guest_id TEXT NOT NULL,
  nick_name TEXT NOT NULL,
  enter_stamp INTEGER NOT NULL,
  heartbeat_stamp INTEGER NOT NULL,
  user_agent TEXT,
  PRIMARY KEY (room_id, nonce)
);

CREATE TABLE IF NOT EXISTS visitors (
  nonce TEXT PRIMARY KEY,
  nick_name TEXT NOT NULL,
  enter_room_stamp INTEGER NOT NULL,
  enter_num INTEGER NOT NULL,
  create_num INTEGER NOT NULL,
  create_room_stamp INTEGER NOT NULL,
  create_stamp INTEGER NOT NULL,
  user_agent TEXT,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_rooms_owner_state ON rooms(owner_nonce, o_state);
CREATE INDEX IF NOT EXISTS idx_rooms_playing ON rooms(o_state, play_status, operate_stamp);
CREATE INDEX IF NOT EXISTS idx_room_participants_room_heartbeat ON room_participants(room_id, heartbeat_stamp);
