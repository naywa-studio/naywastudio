-- Sprint Pricing — introduce a "pricing" pipeline stage.
--
-- In the ESN workflow the sourceur identifies a candidate, then needs to
-- compute whether the profile is commercially viable BEFORE contacting them.
-- The new stage sits between 'identified' and 'contacted':
--
--   identified → pricing → contacted → replied → interview → offer → hired
--   (rejected is terminal, accessible from any stage)
--
-- Existing data is untouched — rows stay in their current stage.

alter table public.match_assessments
  drop constraint if exists match_assessments_pipeline_stage_check;

alter table public.match_assessments
  add constraint match_assessments_pipeline_stage_check
    check (pipeline_stage = any (array[
      'identified'::text,
      'pricing'::text,
      'contacted'::text,
      'replied'::text,
      'interview'::text,
      'offer'::text,
      'hired'::text,
      'rejected'::text
    ]));

comment on column public.match_assessments.pipeline_stage is
  'Pipeline stage. Order: identified → pricing → contacted → replied → interview → offer → hired. rejected is terminal, accessible from any stage.';
