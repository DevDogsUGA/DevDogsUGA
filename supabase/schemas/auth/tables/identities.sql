CREATE TRIGGER identities_guard_link
  BEFORE INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION platform.guard_identity_link();

CREATE TRIGGER identities_request_commit_backfill
  AFTER INSERT ON auth.identities
  FOR EACH ROW
  WHEN (NEW.provider = 'github')
  EXECUTE FUNCTION platform.request_commit_backfill();
