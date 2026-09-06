DROP TRIGGER media_post_insert;
CREATE TRIGGER media_post_insert AFTER INSERT ON "MediaFile" BEGIN
 INSERT OR IGNORE INTO "PostMedia" SELECT id, NEW.id FROM "Post"
 WHERE instr(content, '/api/files/' || NEW.id) > 0 OR instr(COALESCE(coverImage, ''), '/api/files/' || NEW.id) > 0;
 UPDATE "MediaFile" SET private=1 WHERE id=NEW.id AND EXISTS (
  SELECT 1 FROM "PostMedia" pm JOIN "Post" p ON pm.postId=p.id
  WHERE pm.mediaId=NEW.id AND (p.isProtected=1 OR p.status!='PUBLISHED')
 );
END;
