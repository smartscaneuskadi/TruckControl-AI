-- Frontend rollback uses the retained MFA-capable Sites47/48 frontend while
-- the additive schema and legacy projections remain installed. Never drop
-- classification, links or original files to retire this UI.
do $$ begin
 raise exception 'billing_document_retirement_requires_forward_migration' using errcode='55000';
end $$;
