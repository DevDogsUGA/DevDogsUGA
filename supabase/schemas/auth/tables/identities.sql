CREATE TRIGGER identities_guard_link
  BEFORE INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION platform.guard_identity_link();

CREATE TRIGGER identities_claim_contributions
  AFTER INSERT ON auth.identities
  FOR EACH ROW
  EXECUTE FUNCTION platform.claim_contributions();
