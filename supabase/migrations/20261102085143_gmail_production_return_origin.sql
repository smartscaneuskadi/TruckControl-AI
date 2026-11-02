-- Add the existing production hostname; preserve all previously valid states.
-- This replaces only the CHECK with its strict superset, without deleting data.
alter table private.gmail_oauth_states drop constraint gmail_oauth_states_return_origin_check;
alter table private.gmail_oauth_states add constraint gmail_oauth_states_return_origin_check
 check(return_origin in ('https://truckcontrolai.com','https://www.truckcontrolai.com',
 'https://truckcontrol-ai-fase-1.earlymug513.chatgpt.site','https://truckcontrol-ai-candidata.earlymug513.chatgpt.site'));
