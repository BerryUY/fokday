-- Whole dishes (a full birthday cake) can go past 5000 kcal; match the API's new limits.
alter table public.momentum_public_foods drop constraint momentum_public_foods_calories_check;
alter table public.momentum_public_foods drop constraint momentum_public_foods_protein_check;
alter table public.momentum_public_foods add constraint momentum_public_foods_calories_check check (calories between 0 and 20000);
alter table public.momentum_public_foods add constraint momentum_public_foods_protein_check check (protein between 0 and 1500);
