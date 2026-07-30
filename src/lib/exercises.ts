export type ExerciseGroup = "gym" | "home_gym" | "outdoor";

export type BodyRegion =
  | "chest"
  | "back"
  | "shoulders"
  | "arms"
  | "legs"
  | "glutes"
  | "core"
  | "full_body"
  | "cardio";

export type MuscleGroup =
  | "pectorals"
  | "upper_chest"
  | "lats"
  | "mid_back"
  | "lower_back"
  | "traps"
  | "front_delts"
  | "side_delts"
  | "rear_delts"
  | "biceps"
  | "triceps"
  | "forearms"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "abs"
  | "obliques"
  | "hip_flexors"
  | "cardiovascular";

export type ExerciseType =
  | "compound"
  | "isolation"
  | "cardio"
  | "plyometric"
  | "carry"
  | "skill";

export type ExerciseDef = {
  id: string;
  name: string;
  group: ExerciseGroup;
  equipment: string;
  type: ExerciseType;
  bodyRegions: BodyRegion[];
  muscles: MuscleGroup[];
  bodyweight: boolean;
  /** Short hint for logging, e.g. bar path or machine setting */
  tip?: string;
};

export const EXERCISE_GROUPS: Record<
  ExerciseGroup,
  { label: string; description: string }
> = {
  gym: {
    label: "Commercial gym",
    description: "Barbells, machines, cables, racks",
  },
  home_gym: {
    label: "Home gym",
    description: "Dumbbells, bands, bar, bench, kettlebells",
  },
  outdoor: {
    label: "Outdoor & calisthenics",
    description: "Running, parks, bodyweight, sports",
  },
};

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  legs: "Legs",
  glutes: "Glutes",
  core: "Core",
  full_body: "Full body",
  cardio: "Cardio",
};

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  pectorals: "Pectorals",
  upper_chest: "Upper chest",
  lats: "Lats",
  mid_back: "Mid back",
  lower_back: "Lower back",
  traps: "Trapezius",
  front_delts: "Front delts",
  side_delts: "Side delts",
  rear_delts: "Rear delts",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  quads: "Quadriceps",
  hamstrings: "Hamstrings",
  glutes: "Glutes",
  calves: "Calves",
  abs: "Abs",
  obliques: "Obliques",
  hip_flexors: "Hip flexors",
  cardiovascular: "Cardiovascular",
};

/** Comprehensive exercise catalog — gym equipment names match common floor labels. */
export const EXERCISES: ExerciseDef[] = [
  // —— COMMERCIAL GYM ——
  {
    id: "barbell_bench_press",
    name: "Barbell bench press",
    group: "gym",
    equipment: "Flat bench + barbell",
    type: "compound",
    bodyRegions: ["chest", "shoulders", "arms"],
    muscles: ["pectorals", "front_delts", "triceps"],
    bodyweight: false,
    tip: "Flat bench, standard grip",
  },
  {
    id: "incline_barbell_bench",
    name: "Incline barbell bench press",
    group: "gym",
    equipment: "Incline bench + barbell",
    type: "compound",
    bodyRegions: ["chest", "shoulders", "arms"],
    muscles: ["upper_chest", "front_delts", "triceps"],
    bodyweight: false,
  },
  {
    id: "decline_barbell_bench",
    name: "Decline barbell bench press",
    group: "gym",
    equipment: "Decline bench + barbell",
    type: "compound",
    bodyRegions: ["chest", "arms"],
    muscles: ["pectorals", "triceps"],
    bodyweight: false,
  },
  {
    id: "smith_machine_bench",
    name: "Smith machine bench press",
    group: "gym",
    equipment: "Smith machine + flat bench",
    type: "compound",
    bodyRegions: ["chest", "shoulders", "arms"],
    muscles: ["pectorals", "front_delts", "triceps"],
    bodyweight: false,
  },
  {
    id: "chest_press_machine",
    name: "Seated chest press machine",
    group: "gym",
    equipment: "Chest press machine",
    type: "compound",
    bodyRegions: ["chest", "arms"],
    muscles: ["pectorals", "triceps"],
    bodyweight: false,
  },
  {
    id: "pec_deck",
    name: "Pec deck / machine fly",
    group: "gym",
    equipment: "Pec deck machine",
    type: "isolation",
    bodyRegions: ["chest"],
    muscles: ["pectorals"],
    bodyweight: false,
  },
  {
    id: "cable_crossover",
    name: "Cable crossover / cable fly",
    group: "gym",
    equipment: "Cable crossover station",
    type: "isolation",
    bodyRegions: ["chest"],
    muscles: ["pectorals"],
    bodyweight: false,
  },
  {
    id: "barbell_squat",
    name: "Barbell back squat",
    group: "gym",
    equipment: "Squat rack + barbell",
    type: "compound",
    bodyRegions: ["legs", "glutes", "core"],
    muscles: ["quads", "glutes", "hamstrings", "abs"],
    bodyweight: false,
    tip: "High-bar or low-bar",
  },
  {
    id: "front_squat",
    name: "Barbell front squat",
    group: "gym",
    equipment: "Squat rack + barbell",
    type: "compound",
    bodyRegions: ["legs", "glutes", "core"],
    muscles: ["quads", "glutes", "abs"],
    bodyweight: false,
  },
  {
    id: "smith_machine_squat",
    name: "Smith machine squat",
    group: "gym",
    equipment: "Smith machine",
    type: "compound",
    bodyRegions: ["legs", "glutes"],
    muscles: ["quads", "glutes", "hamstrings"],
    bodyweight: false,
  },
  {
    id: "leg_press",
    name: "Leg press machine",
    group: "gym",
    equipment: "Leg press / sled machine",
    type: "compound",
    bodyRegions: ["legs", "glutes"],
    muscles: ["quads", "glutes", "hamstrings"],
    bodyweight: false,
  },
  {
    id: "hack_squat",
    name: "Hack squat machine",
    group: "gym",
    equipment: "Hack squat machine",
    type: "compound",
    bodyRegions: ["legs", "glutes"],
    muscles: ["quads", "glutes"],
    bodyweight: false,
  },
  {
    id: "leg_extension",
    name: "Leg extension machine",
    group: "gym",
    equipment: "Leg extension machine",
    type: "isolation",
    bodyRegions: ["legs"],
    muscles: ["quads"],
    bodyweight: false,
  },
  {
    id: "leg_curl",
    name: "Seated leg curl machine",
    group: "gym",
    equipment: "Seated leg curl machine",
    type: "isolation",
    bodyRegions: ["legs"],
    muscles: ["hamstrings"],
    bodyweight: false,
  },
  {
    id: "lying_leg_curl",
    name: "Lying leg curl machine",
    group: "gym",
    equipment: "Lying leg curl machine",
    type: "isolation",
    bodyRegions: ["legs"],
    muscles: ["hamstrings"],
    bodyweight: false,
  },
  {
    id: "barbell_deadlift",
    name: "Barbell conventional deadlift",
    group: "gym",
    equipment: "Barbell + platform",
    type: "compound",
    bodyRegions: ["back", "legs", "glutes"],
    muscles: ["lower_back", "glutes", "hamstrings", "traps"],
    bodyweight: false,
  },
  {
    id: "romanian_deadlift",
    name: "Romanian deadlift (barbell)",
    group: "gym",
    equipment: "Barbell",
    type: "compound",
    bodyRegions: ["legs", "glutes", "back"],
    muscles: ["hamstrings", "glutes", "lower_back"],
    bodyweight: false,
  },
  {
    id: "sumo_deadlift",
    name: "Sumo deadlift",
    group: "gym",
    equipment: "Barbell + platform",
    type: "compound",
    bodyRegions: ["legs", "glutes", "back"],
    muscles: ["glutes", "quads", "hamstrings", "lower_back"],
    bodyweight: false,
  },
  {
    id: "trap_bar_deadlift",
    name: "Trap bar / hex bar deadlift",
    group: "gym",
    equipment: "Trap bar",
    type: "compound",
    bodyRegions: ["legs", "glutes", "back"],
    muscles: ["quads", "glutes", "hamstrings", "traps"],
    bodyweight: false,
  },
  {
    id: "barbell_row",
    name: "Barbell bent-over row",
    group: "gym",
    equipment: "Barbell",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "mid_back", "biceps", "rear_delts"],
    bodyweight: false,
  },
  {
    id: "pendlay_row",
    name: "Pendlay row",
    group: "gym",
    equipment: "Barbell",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "mid_back", "biceps"],
    bodyweight: false,
  },
  {
    id: "t_bar_row",
    name: "T-bar row machine / landmine row",
    group: "gym",
    equipment: "T-bar row station or landmine",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "mid_back", "biceps"],
    bodyweight: false,
  },
  {
    id: "lat_pulldown",
    name: "Lat pulldown machine",
    group: "gym",
    equipment: "Lat pulldown cable machine",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "biceps"],
    bodyweight: false,
  },
  {
    id: "cable_lat_pulldown",
    name: "Wide-grip cable pulldown",
    group: "gym",
    equipment: "Cable lat pulldown",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "biceps"],
    bodyweight: false,
  },
  {
    id: "seated_cable_row",
    name: "Seated cable row machine",
    group: "gym",
    equipment: "Seated cable row",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "mid_back", "biceps"],
    bodyweight: false,
  },
  {
    id: "chest_supported_row",
    name: "Chest-supported row machine",
    group: "gym",
    equipment: "Chest-supported row machine",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["mid_back", "lats", "biceps"],
    bodyweight: false,
  },
  {
    id: "overhead_press",
    name: "Standing barbell overhead press",
    group: "gym",
    equipment: "Barbell or squat rack",
    type: "compound",
    bodyRegions: ["shoulders", "arms", "core"],
    muscles: ["front_delts", "side_delts", "triceps", "abs"],
    bodyweight: false,
  },
  {
    id: "seated_shoulder_press_machine",
    name: "Seated shoulder press machine",
    group: "gym",
    equipment: "Shoulder press machine",
    type: "compound",
    bodyRegions: ["shoulders", "arms"],
    muscles: ["front_delts", "side_delts", "triceps"],
    bodyweight: false,
  },
  {
    id: "smith_machine_shoulder_press",
    name: "Smith machine shoulder press",
    group: "gym",
    equipment: "Smith machine",
    type: "compound",
    bodyRegions: ["shoulders", "arms"],
    muscles: ["front_delts", "side_delts", "triceps"],
    bodyweight: false,
  },
  {
    id: "cable_face_pull",
    name: "Cable face pull",
    group: "gym",
    equipment: "Cable station + rope",
    type: "isolation",
    bodyRegions: ["shoulders", "back"],
    muscles: ["rear_delts", "traps", "mid_back"],
    bodyweight: false,
  },
  {
    id: "lateral_raise_cable",
    name: "Cable lateral raise",
    group: "gym",
    equipment: "Cable machine",
    type: "isolation",
    bodyRegions: ["shoulders"],
    muscles: ["side_delts"],
    bodyweight: false,
  },
  {
    id: "ez_bar_curl",
    name: "EZ-bar bicep curl",
    group: "gym",
    equipment: "EZ curl bar",
    type: "isolation",
    bodyRegions: ["arms"],
    muscles: ["biceps", "forearms"],
    bodyweight: false,
  },
  {
    id: "skull_crusher",
    name: "EZ-bar skull crusher",
    group: "gym",
    equipment: "EZ bar + flat bench",
    type: "isolation",
    bodyRegions: ["arms"],
    muscles: ["triceps"],
    bodyweight: false,
  },
  {
    id: "cable_tricep_pushdown",
    name: "Cable tricep pushdown",
    group: "gym",
    equipment: "Cable + straight or V bar",
    type: "isolation",
    bodyRegions: ["arms"],
    muscles: ["triceps"],
    bodyweight: false,
  },
  {
    id: "cable_bicep_curl",
    name: "Cable bicep curl",
    group: "gym",
    equipment: "Cable station",
    type: "isolation",
    bodyRegions: ["arms"],
    muscles: ["biceps"],
    bodyweight: false,
  },
  {
    id: "hip_thrust_barbell",
    name: "Barbell hip thrust",
    group: "gym",
    equipment: "Bench + barbell + pad",
    type: "compound",
    bodyRegions: ["glutes", "legs"],
    muscles: ["glutes", "hamstrings"],
    bodyweight: false,
  },
  {
    id: "hip_abductor_machine",
    name: "Hip abductor machine",
    group: "gym",
    equipment: "Hip abductor machine",
    type: "isolation",
    bodyRegions: ["glutes", "legs"],
    muscles: ["glutes"],
    bodyweight: false,
  },
  {
    id: "hip_adductor_machine",
    name: "Hip adductor machine",
    group: "gym",
    equipment: "Hip adductor machine",
    type: "isolation",
    bodyRegions: ["legs"],
    muscles: ["hip_flexors"],
    bodyweight: false,
  },
  {
    id: "standing_calf_raise_machine",
    name: "Standing calf raise machine",
    group: "gym",
    equipment: "Standing calf raise machine",
    type: "isolation",
    bodyRegions: ["legs"],
    muscles: ["calves"],
    bodyweight: false,
  },
  {
    id: "seated_calf_raise_machine",
    name: "Seated calf raise machine",
    group: "gym",
    equipment: "Seated calf machine",
    type: "isolation",
    bodyRegions: ["legs"],
    muscles: ["calves"],
    bodyweight: false,
  },
  {
    id: "assisted_pullup_machine",
    name: "Assisted pull-up / dip machine",
    group: "gym",
    equipment: "Assisted pull-up machine",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "biceps"],
    bodyweight: true,
    tip: "Log added weight only; counterweight assists you",
  },
  {
    id: "cable_pull_through",
    name: "Cable pull-through",
    group: "gym",
    equipment: "Cable + rope",
    type: "compound",
    bodyRegions: ["glutes", "legs"],
    muscles: ["glutes", "hamstrings"],
    bodyweight: false,
  },
  {
    id: "ab_crunch_machine",
    name: "Ab crunch machine",
    group: "gym",
    equipment: "Ab crunch machine",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs"],
    bodyweight: false,
  },
  {
    id: "back_extension_bench",
    name: "Roman chair back extension",
    group: "gym",
    equipment: "Roman chair / hyperextension bench",
    type: "isolation",
    bodyRegions: ["back", "glutes"],
    muscles: ["lower_back", "glutes"],
    bodyweight: true,
    tip: "Add weight plate for extra load",
  },
  {
    id: "landmine_press",
    name: "Landmine press",
    group: "gym",
    equipment: "Landmine attachment + barbell",
    type: "compound",
    bodyRegions: ["shoulders", "chest", "core"],
    muscles: ["front_delts", "pectorals", "abs"],
    bodyweight: false,
  },
  // Legacy ids
  {
    id: "squat",
    name: "Squat (barbell)",
    group: "gym",
    equipment: "Barbell",
    type: "compound",
    bodyRegions: ["legs", "glutes"],
    muscles: ["quads", "glutes", "hamstrings"],
    bodyweight: false,
  },
  {
    id: "deadlift",
    name: "Deadlift (barbell)",
    group: "gym",
    equipment: "Barbell",
    type: "compound",
    bodyRegions: ["back", "legs", "glutes"],
    muscles: ["lower_back", "glutes", "hamstrings"],
    bodyweight: false,
  },
  {
    id: "bench",
    name: "Bench press (barbell)",
    group: "gym",
    equipment: "Barbell + bench",
    type: "compound",
    bodyRegions: ["chest", "arms"],
    muscles: ["pectorals", "triceps", "front_delts"],
    bodyweight: false,
  },

  // —— HOME GYM ——
  {
    id: "dumbbell_bench_press",
    name: "Dumbbell bench press",
    group: "home_gym",
    equipment: "Dumbbells + flat bench",
    type: "compound",
    bodyRegions: ["chest", "arms"],
    muscles: ["pectorals", "triceps", "front_delts"],
    bodyweight: false,
  },
  {
    id: "dumbbell_incline_press",
    name: "Dumbbell incline press",
    group: "home_gym",
    equipment: "Dumbbells + incline bench",
    type: "compound",
    bodyRegions: ["chest", "shoulders"],
    muscles: ["upper_chest", "front_delts", "triceps"],
    bodyweight: false,
  },
  {
    id: "dumbbell_fly",
    name: "Dumbbell chest fly",
    group: "home_gym",
    equipment: "Dumbbells + bench",
    type: "isolation",
    bodyRegions: ["chest"],
    muscles: ["pectorals"],
    bodyweight: false,
  },
  {
    id: "dumbbell_shoulder_press",
    name: "Dumbbell shoulder press",
    group: "home_gym",
    equipment: "Dumbbells",
    type: "compound",
    bodyRegions: ["shoulders", "arms"],
    muscles: ["front_delts", "side_delts", "triceps"],
    bodyweight: false,
  },
  {
    id: "dumbbell_row",
    name: "Single-arm dumbbell row",
    group: "home_gym",
    equipment: "Dumbbell + bench",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "mid_back", "biceps"],
    bodyweight: false,
  },
  {
    id: "dumbbell_curl",
    name: "Dumbbell bicep curl",
    group: "home_gym",
    equipment: "Dumbbells",
    type: "isolation",
    bodyRegions: ["arms"],
    muscles: ["biceps"],
    bodyweight: false,
  },
  {
    id: "dumbbell_tricep_extension",
    name: "Dumbbell tricep extension",
    group: "home_gym",
    equipment: "Dumbbell",
    type: "isolation",
    bodyRegions: ["arms"],
    muscles: ["triceps"],
    bodyweight: false,
  },
  {
    id: "goblet_squat",
    name: "Goblet squat",
    group: "home_gym",
    equipment: "Dumbbell or kettlebell",
    type: "compound",
    bodyRegions: ["legs", "glutes", "core"],
    muscles: ["quads", "glutes", "abs"],
    bodyweight: false,
  },
  {
    id: "dumbbell_lunge",
    name: "Dumbbell walking lunge",
    group: "home_gym",
    equipment: "Dumbbells",
    type: "compound",
    bodyRegions: ["legs", "glutes"],
    muscles: ["quads", "glutes", "hamstrings"],
    bodyweight: false,
  },
  {
    id: "bulgarian_split_squat",
    name: "Bulgarian split squat",
    group: "home_gym",
    equipment: "Dumbbells + bench",
    type: "compound",
    bodyRegions: ["legs", "glutes"],
    muscles: ["quads", "glutes"],
    bodyweight: false,
  },
  {
    id: "dumbbell_rdl",
    name: "Dumbbell Romanian deadlift",
    group: "home_gym",
    equipment: "Dumbbells",
    type: "compound",
    bodyRegions: ["legs", "glutes", "back"],
    muscles: ["hamstrings", "glutes", "lower_back"],
    bodyweight: false,
  },
  {
    id: "kettlebell_swing",
    name: "Kettlebell swing",
    group: "home_gym",
    equipment: "Kettlebell",
    type: "compound",
    bodyRegions: ["glutes", "legs", "back"],
    muscles: ["glutes", "hamstrings", "lower_back"],
    bodyweight: false,
  },
  {
    id: "kettlebell_press",
    name: "Kettlebell press",
    group: "home_gym",
    equipment: "Kettlebell",
    type: "compound",
    bodyRegions: ["shoulders", "arms"],
    muscles: ["front_delts", "triceps"],
    bodyweight: false,
  },
  {
    id: "resistance_band_row",
    name: "Resistance band row",
    group: "home_gym",
    equipment: "Resistance bands + anchor",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "mid_back", "biceps"],
    bodyweight: false,
  },
  {
    id: "band_pull_apart",
    name: "Band pull-apart",
    group: "home_gym",
    equipment: "Resistance band",
    type: "isolation",
    bodyRegions: ["shoulders", "back"],
    muscles: ["rear_delts", "mid_back"],
    bodyweight: false,
  },
  {
    id: "band_chest_press",
    name: "Resistance band chest press",
    group: "home_gym",
    equipment: "Resistance bands + anchor",
    type: "compound",
    bodyRegions: ["chest", "arms"],
    muscles: ["pectorals", "triceps"],
    bodyweight: false,
  },
  {
    id: "pull_up_bar",
    name: "Pull-up",
    group: "home_gym",
    equipment: "Pull-up bar",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "biceps"],
    bodyweight: true,
    tip: "Log added weight (belt/plate); 0 = bodyweight only",
  },
  {
    id: "chin_up",
    name: "Chin-up",
    group: "home_gym",
    equipment: "Pull-up bar",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "biceps"],
    bodyweight: true,
  },
  {
    id: "dip_parallel_bars",
    name: "Parallel bar dip",
    group: "home_gym",
    equipment: "Dip bars / parallettes",
    type: "compound",
    bodyRegions: ["chest", "arms", "shoulders"],
    muscles: ["triceps", "pectorals", "front_delts"],
    bodyweight: true,
  },
  {
    id: "push_up",
    name: "Push-up",
    group: "home_gym",
    equipment: "Floor",
    type: "compound",
    bodyRegions: ["chest", "arms", "core"],
    muscles: ["pectorals", "triceps", "front_delts", "abs"],
    bodyweight: true,
  },
  {
    id: "pike_push_up",
    name: "Pike push-up",
    group: "home_gym",
    equipment: "Floor",
    type: "compound",
    bodyRegions: ["shoulders", "arms"],
    muscles: ["front_delts", "triceps"],
    bodyweight: true,
  },
  {
    id: "inverted_row",
    name: "Inverted row (bar)",
    group: "home_gym",
    equipment: "Smith bar or rack bar",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "mid_back", "biceps"],
    bodyweight: true,
    tip: "Feet elevated = harder; add weight on chest if needed",
  },
  {
    id: "ab_wheel",
    name: "Ab wheel rollout",
    group: "home_gym",
    equipment: "Ab wheel",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "obliques"],
    bodyweight: true,
  },
  {
    id: "plank",
    name: "Plank hold",
    group: "home_gym",
    equipment: "Floor",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "obliques"],
    bodyweight: true,
    tip: "Log duration as reps (seconds) or use notes",
  },
  {
    id: "hanging_leg_raise",
    name: "Hanging leg raise",
    group: "home_gym",
    equipment: "Pull-up bar",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "hip_flexors"],
    bodyweight: true,
  },
  {
    id: "trx_row",
    name: "TRX / suspension row",
    group: "home_gym",
    equipment: "TRX straps",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "mid_back", "biceps"],
    bodyweight: true,
  },
  {
    id: "trx_push_up",
    name: "TRX push-up",
    group: "home_gym",
    equipment: "TRX straps",
    type: "compound",
    bodyRegions: ["chest", "arms", "core"],
    muscles: ["pectorals", "triceps", "abs"],
    bodyweight: true,
  },
  {
    id: "floor_press",
    name: "Dumbbell floor press",
    group: "home_gym",
    equipment: "Dumbbells",
    type: "compound",
    bodyRegions: ["chest", "arms"],
    muscles: ["pectorals", "triceps"],
    bodyweight: false,
  },

  // —— OUTDOOR & SPORTS ——
  {
    id: "running",
    name: "Running / jogging",
    group: "outdoor",
    equipment: "Outdoor / treadmill",
    type: "cardio",
    bodyRegions: ["legs", "cardio", "full_body"],
    muscles: ["quads", "hamstrings", "calves", "cardiovascular"],
    bodyweight: true,
    tip: "Plan distance (km) + optional pace; minutes lock on Stop",
  },
  {
    id: "sprint_intervals",
    name: "Sprint intervals",
    group: "outdoor",
    equipment: "Track / field",
    type: "cardio",
    bodyRegions: ["legs", "cardio"],
    muscles: ["quads", "hamstrings", "glutes", "cardiovascular"],
    bodyweight: true,
  },
  {
    id: "cycling",
    name: "Cycling",
    group: "outdoor",
    equipment: "Bike / stationary bike",
    type: "cardio",
    bodyRegions: ["legs", "cardio"],
    muscles: ["quads", "hamstrings", "glutes", "cardiovascular"],
    bodyweight: true,
    tip: "Plan distance (km) + optional pace; minutes lock on Stop",
  },
  {
    id: "hiking",
    name: "Hiking / walking",
    group: "outdoor",
    equipment: "Trail",
    type: "cardio",
    bodyRegions: ["legs", "cardio"],
    muscles: ["quads", "hamstrings", "calves", "cardiovascular"],
    bodyweight: true,
    tip: "Plan distance (km) + optional pace; minutes lock on Stop",
  },
  {
    id: "rucking",
    name: "Rucking (weighted backpack)",
    group: "outdoor",
    equipment: "Backpack + load",
    type: "carry",
    bodyRegions: ["legs", "back", "core"],
    muscles: ["quads", "glutes", "lower_back", "abs"],
    bodyweight: true,
    tip: "Log backpack weight as added weight",
  },
  {
    id: "outdoor_pull_up",
    name: "Outdoor pull-up (park bar)",
    group: "outdoor",
    equipment: "Calisthenics park bar",
    type: "compound",
    bodyRegions: ["back", "arms"],
    muscles: ["lats", "biceps"],
    bodyweight: true,
  },
  {
    id: "outdoor_dip",
    name: "Outdoor dip (park bars)",
    group: "outdoor",
    equipment: "Parallel bars",
    type: "compound",
    bodyRegions: ["chest", "arms"],
    muscles: ["triceps", "pectorals"],
    bodyweight: true,
  },
  {
    id: "muscle_up",
    name: "Muscle-up",
    group: "outdoor",
    equipment: "Pull-up bar",
    type: "skill",
    bodyRegions: ["back", "arms", "chest"],
    muscles: ["lats", "triceps", "pectorals"],
    bodyweight: true,
  },
  {
    id: "burpee",
    name: "Burpee",
    group: "outdoor",
    equipment: "Floor",
    type: "plyometric",
    bodyRegions: ["full_body", "cardio"],
    muscles: ["quads", "pectorals", "abs", "cardiovascular"],
    bodyweight: true,
  },
  {
    id: "jump_rope",
    name: "Jump rope",
    group: "outdoor",
    equipment: "Jump rope",
    type: "cardio",
    bodyRegions: ["legs", "cardio"],
    muscles: ["calves", "cardiovascular"],
    bodyweight: true,
  },
  {
    id: "swimming",
    name: "Swimming",
    group: "outdoor",
    equipment: "Pool / open water",
    type: "cardio",
    bodyRegions: ["full_body", "cardio"],
    muscles: ["lats", "pectorals", "triceps", "cardiovascular"],
    bodyweight: true,
  },
  {
    id: "stair_climb",
    name: "Stair climbing",
    group: "outdoor",
    equipment: "Stairs / stadium",
    type: "cardio",
    bodyRegions: ["legs", "cardio"],
    muscles: ["quads", "glutes", "calves", "cardiovascular"],
    bodyweight: true,
  },
  {
    id: "box_jump",
    name: "Box jump",
    group: "outdoor",
    equipment: "Box / park ledge",
    type: "plyometric",
    bodyRegions: ["legs"],
    muscles: ["quads", "glutes", "calves"],
    bodyweight: true,
  },
  {
    id: "bear_crawl",
    name: "Bear crawl",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "compound",
    bodyRegions: ["full_body", "core"],
    muscles: ["front_delts", "quads", "abs"],
    bodyweight: true,
  },
  {
    id: "sandbag_carry",
    name: "Sandbag carry",
    group: "outdoor",
    equipment: "Sandbag",
    type: "carry",
    bodyRegions: ["full_body", "core"],
    muscles: ["glutes", "quads", "abs", "forearms"],
    bodyweight: false,
  },
  {
    id: "outdoor_push_up",
    name: "Outdoor push-up",
    group: "outdoor",
    equipment: "Ground",
    type: "compound",
    bodyRegions: ["chest", "arms"],
    muscles: ["pectorals", "triceps"],
    bodyweight: true,
  },
  // —— OUTDOOR ABS / CORE ——
  {
    id: "outdoor_crunch",
    name: "Crunches",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs"],
    bodyweight: true,
  },
  {
    id: "outdoor_sit_up",
    name: "Sit-ups",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "hip_flexors"],
    bodyweight: true,
  },
  {
    id: "outdoor_leg_raise",
    name: "Lying leg raise",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "hip_flexors"],
    bodyweight: true,
  },
  {
    id: "outdoor_plank",
    name: "Outdoor plank",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "obliques"],
    bodyweight: true,
    tip: "Log duration as reps (seconds)",
  },
  {
    id: "outdoor_side_plank",
    name: "Side plank",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["obliques", "abs"],
    bodyweight: true,
    tip: "Log duration as reps (seconds) per side",
  },
  {
    id: "outdoor_russian_twist",
    name: "Russian twist",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["obliques", "abs"],
    bodyweight: true,
    tip: "Add a rock or bottle for load",
  },
  {
    id: "outdoor_bicycle_crunch",
    name: "Bicycle crunch",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "obliques"],
    bodyweight: true,
  },
  {
    id: "outdoor_mountain_climber",
    name: "Mountain climbers",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "plyometric",
    bodyRegions: ["core", "cardio"],
    muscles: ["abs", "hip_flexors", "cardiovascular"],
    bodyweight: true,
  },
  {
    id: "outdoor_hanging_knee_raise",
    name: "Hanging knee raise (park bar)",
    group: "outdoor",
    equipment: "Calisthenics park bar",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "hip_flexors"],
    bodyweight: true,
  },
  {
    id: "outdoor_toes_to_bar",
    name: "Toes-to-bar",
    group: "outdoor",
    equipment: "Calisthenics park bar",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "hip_flexors", "lats"],
    bodyweight: true,
  },
  {
    id: "outdoor_v_up",
    name: "V-ups",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs", "hip_flexors"],
    bodyweight: true,
  },
  {
    id: "outdoor_dead_bug",
    name: "Dead bug",
    group: "outdoor",
    equipment: "Floor / grass",
    type: "isolation",
    bodyRegions: ["core"],
    muscles: ["abs"],
    bodyweight: true,
  },
];

const exerciseMap = new Map(EXERCISES.map((e) => [e.id, e]));

export function getExercise(id: string): ExerciseDef | undefined {
  return exerciseMap.get(id);
}

export function getExercisesByGroup(group: ExerciseGroup): ExerciseDef[] {
  return EXERCISES.filter((e) => e.group === group);
}

export function searchExercises(
  query: string,
  groups?: ExerciseGroup | ExerciseGroup[],
): ExerciseDef[] {
  const q = query.trim().toLowerCase();
  const allowed =
    groups == null
      ? null
      : new Set(Array.isArray(groups) ? groups : [groups]);
  const list = allowed
    ? EXERCISES.filter((e) => allowed.has(e.group))
    : EXERCISES;
  if (!q) return list;
  return list.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.equipment.toLowerCase().includes(q) ||
      e.id.includes(q),
  );
}

export type MuscleSummary = {
  muscle: MuscleGroup;
  sets: number;
  label: string;
};

export function summarizeMuscles(
  exerciseIds: string[],
): MuscleSummary[] {
  const counts = new Map<MuscleGroup, number>();
  for (const id of exerciseIds) {
    const ex = getExercise(id);
    if (!ex) continue;
    for (const m of ex.muscles) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([muscle, sets]) => ({
      muscle,
      sets,
      label: MUSCLE_LABELS[muscle],
    }))
    .sort((a, b) => b.sets - a.sets);
}

export function summarizeRegions(exerciseIds: string[]): BodyRegion[] {
  const set = new Set<BodyRegion>();
  for (const id of exerciseIds) {
    const ex = getExercise(id);
    if (ex) ex.bodyRegions.forEach((r) => set.add(r));
  }
  return Array.from(set);
}

/** Set counts per body region for heatmap intensity. */
export function summarizeRegionCounts(
  exerciseIds: string[],
): Record<BodyRegion, number> {
  const counts = Object.fromEntries(
    (
      [
        "chest",
        "back",
        "shoulders",
        "arms",
        "legs",
        "glutes",
        "core",
        "full_body",
        "cardio",
      ] as BodyRegion[]
    ).map((r) => [r, 0]),
  ) as Record<BodyRegion, number>;

  for (const id of exerciseIds) {
    const ex = getExercise(id);
    if (!ex) continue;
    for (const r of ex.bodyRegions) {
      counts[r] += 1;
    }
  }
  return counts;
}

/** Effective load for volume: bodyweight + added, or bar/dumbbell weight. */
export function effectiveLoadKg(
  exerciseId: string,
  weightKg: number,
  bodyWeightKg: number | null | undefined,
): number {
  const ex = getExercise(exerciseId);
  if (ex?.type === "cardio") return 0;
  if (ex?.bodyweight) {
    return Math.max(0, (bodyWeightKg ?? 0) + weightKg);
  }
  return Math.max(0, weightKg);
}

export function formatSetWeight(exerciseId: string, weightKg: number): string {
  const ex = getExercise(exerciseId);
  if (ex?.type === "cardio") return "—";
  if (ex?.bodyweight) {
    return weightKg > 0 ? `BW + ${weightKg} kg` : "Bodyweight";
  }
  return `${weightKg} kg`;
}

export function isCardioExercise(exerciseId: string): boolean {
  return getExercise(exerciseId)?.type === "cardio";
}

export function exerciseDisplayName(id: string): string {
  return getExercise(id)?.name ?? id.replace(/_/g, " ");
}

export type DayLiftStats = {
  totalSets: number;
  totalReps: number;
  volumeKg: number;
  heaviestKg: number;
  exerciseCount: number;
};

export function computeDayStats(
  sets: Array<{ lift: string; reps: number; weightKg: number }>,
  bodyWeightKg?: number | null,
): DayLiftStats {
  const exercises = new Set<string>();
  let totalReps = 0;
  let volumeKg = 0;
  let heaviestKg = 0;
  for (const s of sets) {
    exercises.add(s.lift);
    totalReps += s.reps;
    const load = effectiveLoadKg(s.lift, s.weightKg, bodyWeightKg);
    volumeKg += load * s.reps;
    heaviestKg = Math.max(heaviestKg, load);
  }
  return {
    totalSets: sets.length,
    totalReps,
    volumeKg,
    heaviestKg,
    exerciseCount: exercises.size,
  };
}

/** Lighthearted equivalents for volume bragging. */
export function funnyVolumeLines(volumeKg: number): string[] {
  if (volumeKg <= 0) return [];
  const lines: string[] = [];
  const elephants = volumeKg / 5000;
  if (elephants >= 0.05) {
    lines.push(
      `≈ ${elephants < 1 ? elephants.toFixed(2) : elephants.toFixed(1)} African elephants`,
    );
  }
  const cars = volumeKg / 1400;
  if (cars >= 0.1) {
    lines.push(`≈ ${cars < 1 ? cars.toFixed(2) : cars.toFixed(1)} compact cars`);
  }
  const pizzas = volumeKg / 1.2;
  if (pizzas >= 1) {
    lines.push(`≈ ${Math.round(pizzas).toLocaleString()} large pizzas`);
  }
  const cows = volumeKg / 700;
  if (cows >= 0.15) {
    lines.push(`≈ ${cows < 1 ? cows.toFixed(2) : cows.toFixed(1)} dairy cows`);
  }
  return lines.slice(0, 3);
}

export type GroupedExerciseSets<T extends { lift: string; setNumber: number }> =
  {
    lift: string;
    name: string;
    bodyweight: boolean;
    cardio: boolean;
    sets: T[];
  };

export function groupSetsByExercise<
  T extends { lift: string; setNumber: number },
>(sets: T[]): GroupedExerciseSets<T>[] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const s of sets) {
    if (!map.has(s.lift)) {
      map.set(s.lift, []);
      order.push(s.lift);
    }
    map.get(s.lift)!.push(s);
  }
  return order.map((lift) => {
    const ex = getExercise(lift);
    const groupSets = [...(map.get(lift) ?? [])].sort(
      (a, b) => a.setNumber - b.setNumber,
    );
    return {
      lift,
      name: exerciseDisplayName(lift),
      bodyweight: ex?.bodyweight ?? false,
      cardio: ex?.type === "cardio",
      sets: groupSets,
    };
  });
}
