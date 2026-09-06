-- Online writes now parse local URLs once and maintain PostMedia in the same
-- transaction. Existing references are preserved here; upgrade-media.mjs repairs
-- noncanonical legacy URLs once before the application starts.
DROP TRIGGER IF EXISTS post_media_insert;
DROP TRIGGER IF EXISTS post_media_update;
DROP TRIGGER IF EXISTS media_post_insert;
