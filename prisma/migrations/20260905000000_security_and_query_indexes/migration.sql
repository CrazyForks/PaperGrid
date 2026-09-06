ALTER TABLE "MediaFile" ADD COLUMN "private" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "PostMedia" (
 "postId" TEXT NOT NULL,
 "mediaId" TEXT NOT NULL,
 PRIMARY KEY ("postId", "mediaId"),
 FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 FOREIGN KEY ("mediaId") REFERENCES "MediaFile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PostMedia_mediaId_idx" ON "PostMedia"("mediaId");
CREATE INDEX "Post_status_publishedAt_id_idx" ON "Post"("status", "publishedAt", "id");
CREATE INDEX "Post_status_categoryId_publishedAt_idx" ON "Post"("status", "categoryId", "publishedAt");
CREATE INDEX "Comment_postId_status_createdAt_id_idx" ON "Comment"("postId", "status", "createdAt", "id");
INSERT OR IGNORE INTO "PostMedia" SELECT p.id, m.id FROM "Post" p JOIN "MediaFile" m
 ON instr(p.content, '/api/files/' || m.id) > 0 OR instr(COALESCE(p.coverImage, ''), '/api/files/' || m.id) > 0;
-- Maintain references for admin, plugin and legacy import writes alike.
CREATE TRIGGER post_media_insert AFTER INSERT ON "Post" BEGIN
 INSERT OR IGNORE INTO "PostMedia" SELECT NEW.id, id FROM "MediaFile"
 WHERE instr(NEW.content, '/api/files/' || id) > 0 OR instr(COALESCE(NEW.coverImage, ''), '/api/files/' || id) > 0;
 UPDATE "MediaFile" SET private = EXISTS (
  SELECT 1 FROM "PostMedia" pm JOIN "Post" p ON pm.postId=p.id
  WHERE pm.mediaId="MediaFile".id AND (p.isProtected=1 OR p.status != 'PUBLISHED')
 ) WHERE id IN (SELECT mediaId FROM "PostMedia" WHERE postId=NEW.id);
END;
CREATE TRIGGER post_media_update AFTER UPDATE OF content, coverImage, isProtected, status ON "Post" BEGIN
 DELETE FROM "PostMedia" WHERE postId = NEW.id;
 INSERT OR IGNORE INTO "PostMedia" SELECT NEW.id, id FROM "MediaFile"
 WHERE instr(NEW.content, '/api/files/' || id) > 0 OR instr(COALESCE(NEW.coverImage, ''), '/api/files/' || id) > 0;
 UPDATE "MediaFile" SET private = EXISTS (
  SELECT 1 FROM "PostMedia" pm JOIN "Post" p ON pm.postId=p.id
  WHERE pm.mediaId="MediaFile".id AND (p.isProtected=1 OR p.status != 'PUBLISHED')
 ) WHERE id IN (SELECT mediaId FROM "PostMedia" WHERE postId=NEW.id);
END;
CREATE TRIGGER media_post_insert AFTER INSERT ON "MediaFile" BEGIN
 INSERT OR IGNORE INTO "PostMedia" SELECT id, NEW.id FROM "Post"
 WHERE instr(content, '/api/files/' || NEW.id) > 0 OR instr(COALESCE(coverImage, ''), '/api/files/' || NEW.id) > 0;
END;

UPDATE "MediaFile" SET private=1 WHERE id IN (
 SELECT pm.mediaId FROM "PostMedia" pm JOIN "Post" p ON p.id=pm.postId
 WHERE p.isProtected=1 OR p.status != 'PUBLISHED'
);
