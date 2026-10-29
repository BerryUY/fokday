-- Free AI photos: 1 per day, plus 1 more for watching one rewarded video (was 2 + up to 3 for 2 videos each).
update momentum_config set value = case key
  when 'photo_free' then '1'
  when 'photo_bonus_max' then '1'
  when 'photo_videos_per_extra' then '1'
end
where key in ('photo_free', 'photo_bonus_max', 'photo_videos_per_extra');

