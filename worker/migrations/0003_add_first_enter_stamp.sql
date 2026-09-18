ALTER TABLE room_participants ADD COLUMN first_enter_stamp INTEGER;

UPDATE room_participants
SET first_enter_stamp = enter_stamp
WHERE first_enter_stamp IS NULL;
