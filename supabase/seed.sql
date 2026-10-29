-- =====================================================================
-- SAMPLE DATA - for testing / understanding the system.
-- Run AFTER schema.sql, in Supabase -> SQL Editor.
-- Running it twice does nothing the second time.
-- To remove it later, run the "REMOVE SAMPLE DATA" block at the bottom.
-- =====================================================================
--
-- TECHNICIAN STORIES (what you should see on the Technician Credit tab):
--
-- Ali Raza   - took items, returned some, paid part of the bill
--   Backlight 32"  : took 6 x Rs 650, returned 2 -> used 4  = Rs 2,600
--   Power Supply   : took 1 x Rs 2,500             -> used 1 = Rs 2,500
--   IR Sensor      : took 4 x Rs 300               -> used 4 = Rs 1,200
--   Bill Rs 6,300  - paid Rs 2,000                 = BALANCE DUE Rs 4,300
--
-- Usman Tariq - returned a whole item, then paid everything
--   T-Con Board    : took 2 x Rs 3,000, returned 2 -> used 0 = Rs 0
--   Backlight 43"  : took 3 x Rs 950               -> used 3 = Rs 2,850
--   Thermal paste  : took 1 x Rs 200 (not from inventory)    = Rs 200
--   Bill Rs 3,050  - paid Rs 3,050                 = BALANCE DUE Rs 0
--
-- Faizan Noor - nothing paid yet
--   Main Board     : took 1 x Rs 7,500             -> used 1 = Rs 7,500
--   Speaker Pair   : took 2 x Rs 900, returned 1   -> used 1 = Rs 900
--   Bill Rs 8,400  - paid Rs 0                     = BALANCE DUE Rs 8,400
--
-- Inventory stock goes down when items are taken and back up when returned,
-- e.g. Backlight 32" starts at 40 -> Ali takes 6 (34) -> returns 2 (36).
-- =====================================================================

do $$
declare
  ali uuid; usman uuid; faizan uuid;
  bl32 uuid; bl43 uuid; psu uuid; tcon uuid; mainb uuid; ir uuid; spk uuid;
  p uuid;
  y int := extract(year from current_date)::int;
begin
  if exists (select 1 from public.technicians where name = 'Ali Raza' and phone = '0300-1112233') then
    raise notice 'Sample data already loaded - skipping.';
    return;
  end if;

  -- ---------------- Inventory ----------------
  insert into public.inventory_items (name, category, sku, quantity, cost_price, sale_price, min_stock) values
    ('LED Backlight Strip 32"', 'Backlight', 'BL-32', 40, 450, 650, 10) returning id into bl32;
  insert into public.inventory_items (name, category, sku, quantity, cost_price, sale_price, min_stock) values
    ('LED Backlight Strip 43"', 'Backlight', 'BL-43', 30, 700, 950, 10) returning id into bl43;
  insert into public.inventory_items (name, category, sku, quantity, cost_price, sale_price, min_stock) values
    ('Power Supply Board (Universal)', 'Boards', 'PSU-U', 12, 1800, 2500, 3) returning id into psu;
  insert into public.inventory_items (name, category, sku, quantity, cost_price, sale_price, min_stock) values
    ('T-Con Board', 'Boards', 'TCON', 8, 2200, 3000, 3) returning id into tcon;
  insert into public.inventory_items (name, category, sku, quantity, cost_price, sale_price, min_stock) values
    ('Main Board (Android)', 'Boards', 'MB-AND', 3, 5500, 7500, 2) returning id into mainb;
  insert into public.inventory_items (name, category, sku, quantity, cost_price, sale_price, min_stock) values
    ('IR Sensor', 'Parts', 'IR-01', 25, 150, 300, 5) returning id into ir;
  insert into public.inventory_items (name, category, sku, quantity, cost_price, sale_price, min_stock) values
    ('Speaker Pair', 'Audio', 'SPK-2', 10, 600, 900, 3) returning id into spk;

  -- ---------------- Technicians ----------------
  insert into public.technicians (name, phone) values ('Ali Raza', '0300-1112233') returning id into ali;
  insert into public.technicians (name, phone) values ('Usman Tariq', '0321-4455667') returning id into usman;
  insert into public.technicians (name, phone) values ('Faizan Noor', '0333-7788990') returning id into faizan;

  -- ---------------- Ali Raza ----------------
  -- Step 1: takes products (stock goes down automatically)
  insert into public.technician_purchases (technician_id, item_id, item_name, quantity, unit_price, purchase_date, notes)
    values (ali, bl32, 'LED Backlight Strip 32"', 6, 650, current_date - 10, 'For Samsung 32" jobs')
    returning id into p;
  -- Step 2: returns 2 unused strips (stock goes back up, bill goes down)
  update public.technician_purchases set returned_quantity = 2, returned_date = current_date - 8 where id = p;

  insert into public.technician_purchases (technician_id, item_id, item_name, quantity, unit_price, purchase_date, notes)
    values (ali, psu, 'Power Supply Board (Universal)', 1, 2500, current_date - 7, 'Client C-100245');
  insert into public.technician_purchases (technician_id, item_id, item_name, quantity, unit_price, purchase_date)
    values (ali, ir, 'IR Sensor', 4, 300, current_date - 3);
  -- Step 3: pays part of the bill
  insert into public.technician_payments (technician_id, amount, payment_date, notes)
    values (ali, 2000, current_date - 5, 'Cash');

  -- ---------------- Usman Tariq ----------------
  insert into public.technician_purchases (technician_id, item_id, item_name, quantity, unit_price, purchase_date, notes)
    values (usman, tcon, 'T-Con Board', 2, 3000, current_date - 20, 'Took extra, not needed')
    returning id into p;
  update public.technician_purchases set returned_quantity = 2, returned_date = current_date - 18 where id = p;

  insert into public.technician_purchases (technician_id, item_id, item_name, quantity, unit_price, purchase_date)
    values (usman, bl43, 'LED Backlight Strip 43"', 3, 950, current_date - 15);
  insert into public.technician_purchases (technician_id, item_id, item_name, quantity, unit_price, purchase_date, notes)
    values (usman, null, 'Thermal paste', 1, 200, current_date - 15, 'Bought from market, not in inventory');
  insert into public.technician_payments (technician_id, amount, payment_date, notes)
    values (usman, 3050, current_date - 12, 'Easypaisa - full payment');

  -- ---------------- Faizan Noor ----------------
  insert into public.technician_purchases (technician_id, item_id, item_name, quantity, unit_price, purchase_date, notes)
    values (faizan, mainb, 'Main Board (Android)', 1, 7500, current_date - 2, 'Client C-100251 - Haier 43"');
  insert into public.technician_purchases (technician_id, item_id, item_name, quantity, unit_price, purchase_date)
    values (faizan, spk, 'Speaker Pair', 2, 900, current_date)
    returning id into p;
  update public.technician_purchases set returned_quantity = 1, returned_date = current_date where id = p;

  -- ---------------- Complaints + invoices (for the dashboard charts) ----------------
  insert into public.complaints (complaint_no, client_name, led_model, serial_number, phone, address, technician, defect, status, complaint_date) values
    ('C-100231', 'Ahmed Khan',   'LG OLED 55"',    'LG55X8812',  '0300-1234567', 'Model Town, Lahore',    'Ali Raza',    'Display issue',   'resolved',    make_date(y, 1, 12)),
    ('C-100232', 'Sara Ali',     'Samsung 43"',    'SM43A2291',  '0321-7654321', 'Johar Town, Lahore',    'Usman Tariq', 'No power',        'resolved',    make_date(y, 2, 3)),
    ('C-100233', 'Bilal Ahmed',  'Sony 50"',       'SN50K7730',  '0301-2345678', 'DHA Phase 5, Lahore',   'Faizan Noor', 'No sound',        'resolved',    make_date(y, 2, 21)),
    ('C-100234', 'Fatima Noor',  'TCL 42"',        'TC42P1180',  '0345-6789012', 'Gulberg III, Lahore',   'Usman Tariq', 'Backlight issue', 'resolved',    make_date(y, 3, 9)),
    ('C-100235', 'Hamza Sheikh', 'Haier 32"',      'HR32F5521',  '0312-3456789', 'Iqbal Town, Lahore',    'Ali Raza',    'Lines on screen', 'resolved',    make_date(y, 4, 14)),
    ('C-100236', 'Ayesha Malik', 'Samsung 55"',    'SM55T9087',  '0333-1122334', 'Bahria Town, Lahore',   'Faizan Noor', 'Board fault',     'resolved',    make_date(y, 5, 2)),
    ('C-100237', 'Usama Javed',  'Hisense 50"',    'HS50U4410',  '0302-9988776', 'Township, Lahore',      'Ali Raza',    'Backlight issue', 'resolved',    make_date(y, 6, 18)),
    ('C-100238', 'Zainab Iqbal', 'LG 43"',         'LG43U3301',  '0322-5566778', 'Wapda Town, Lahore',    'Usman Tariq', 'Remote / IR issue','resolved',   make_date(y, 7, 7)),
    ('C-100239', 'Kamran Butt',  'Sony 65"',       'SN65X9001',  '0300-4433221', 'Cantt, Lahore',         'Faizan Noor', 'Panel broken',    'resolved',    make_date(y, 8, 25)),
    ('C-100245', 'Nadia Hussain','Samsung 32"',    'SM32N1102',  '0311-2233445', 'Faisal Town, Lahore',   'Ali Raza',    'No power',        'resolved',    current_date - 7),
    ('C-100251', 'Imran Shah',   'Haier 43"',      'HR43K6620',  '0334-6677889', 'Allama Iqbal Town',     'Faizan Noor', 'Board fault',     'in_progress', current_date - 2),
    ('C-100252', 'Hira Aslam',   'TCL 50"',        'TC50C7714',  '0320-1029384', 'Shadman, Lahore',       null,          'Display issue',   'pending',     current_date)
  on conflict (complaint_no) do nothing;

  -- One invoice per finished job; the last one is still pending.
  insert into public.invoices (invoice_no, complaint_id, description, amount, status, invoice_date)
  select 'INV-SAMPLE-' || right(c2.complaint_no, 3), c2.id, 'LED Repair Service', v.amount, v.status, c2.complaint_date
  from (values
    ('C-100231', 4500, 'paid'), ('C-100232', 3200, 'paid'), ('C-100233', 2500, 'paid'),
    ('C-100234', 3800, 'paid'), ('C-100235', 2800, 'paid'), ('C-100236', 9500, 'paid'),
    ('C-100237', 4200, 'paid'), ('C-100238', 1500, 'paid'), ('C-100239', 12000, 'paid'),
    ('C-100245', 5000, 'paid'), ('C-100251', 11000, 'pending')
  ) as v(no, amount, status)
  join public.complaints c2 on c2.complaint_no = v.no
  on conflict (invoice_no) do nothing;

  raise notice 'Sample data loaded.';
end $$;

-- =====================================================================
-- REMOVE SAMPLE DATA  (select the lines below and run them)
-- =====================================================================
-- delete from public.technicians where phone in ('0300-1112233', '0321-4455667', '0333-7788990');
-- delete from public.inventory_items where sku in ('BL-32','BL-43','PSU-U','TCON','MB-AND','IR-01','SPK-2');
-- delete from public.complaints where complaint_no in ('C-100231','C-100232','C-100233','C-100234','C-100235','C-100236','C-100237','C-100238','C-100239','C-100245','C-100251','C-100252');
