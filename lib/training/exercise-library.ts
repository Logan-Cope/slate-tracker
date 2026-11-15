/**
 * Starter exercise library. Names are what show in the app, so they read the
 * way people say them in a commercial gym.
 */
export type LibraryExercise = {
  name: string;
  kind: "weight_reps" | "bodyweight_reps" | "duration" | "distance";
  muscle: string;
  equipment: string;
};

const w = (name: string, muscle: string, equipment: string): LibraryExercise => ({
  name,
  kind: "weight_reps",
  muscle,
  equipment,
});
const bw = (name: string, muscle: string): LibraryExercise => ({
  name,
  kind: "bodyweight_reps",
  muscle,
  equipment: "bodyweight",
});

export const EXERCISE_LIBRARY: LibraryExercise[] = [
  // Glutes / hips
  w("Hip Thrust Machine", "glutes", "machine"),
  w("Barbell Hip Thrust", "glutes", "barbell"),
  w("Hip Thrust", "glutes", "barbell"),
  w("Glute Bridge", "glutes", "barbell"),
  w("Cable Kickback", "glutes", "cable"),
  w("Abductor Machine", "glutes", "machine"),
  w("Adductor Machine", "adductors", "machine"),
  w("Hyperextension (glute-focused)", "glutes", "bench"),
  w("Hyperextension", "lower back", "bench"),
  w("Reverse Hyper", "glutes", "machine"),
  w("Step Up", "glutes", "dumbbell"),
  // Quads
  w("Leg Press", "quads", "machine"),
  w("Hack Squat", "quads", "machine"),
  w("Smith Machine Squat", "quads", "smith machine"),
  w("Barbell Back Squat", "quads", "barbell"),
  w("Goblet Squat", "quads", "dumbbell"),
  w("Leg Extension", "quads", "machine"),
  w("Bulgarian Split Squat", "quads", "dumbbell"),
  w("Walking Lunge", "quads", "dumbbell"),
  w("Reverse Lunge", "quads", "dumbbell"),
  w("Pendulum Squat", "quads", "machine"),
  w("Belt Squat", "quads", "machine"),
  // Hamstrings
  w("Dumbbell Romanian Deadlift", "hamstrings", "dumbbell"),
  w("Barbell Romanian Deadlift", "hamstrings", "barbell"),
  w("Seated Leg Curl", "hamstrings", "machine"),
  w("Lying Leg Curl", "hamstrings", "machine"),
  w("Good Morning", "hamstrings", "barbell"),
  w("Nordic Curl", "hamstrings", "bodyweight"),
  w("Conventional Deadlift", "hamstrings", "barbell"),
  w("Sumo Deadlift", "glutes", "barbell"),
  w("Trap Bar Deadlift", "hamstrings", "trap bar"),
  // Calves
  w("Calf Raise Machine", "calves", "machine"),
  w("Standing Calf Raise", "calves", "machine"),
  w("Seated Calf Raise", "calves", "machine"),
  w("Leg Press Calf Raise", "calves", "machine"),
  // Chest
  w("Incline Dumbbell Press", "chest", "dumbbell"),
  w("Flat Dumbbell Press", "chest", "dumbbell"),
  w("Barbell Bench Press", "chest", "barbell"),
  w("Incline Barbell Bench Press", "chest", "barbell"),
  w("Incline Press Machine", "chest", "machine"),
  w("Chest Press Machine", "chest", "machine"),
  w("Chest Fly Machine", "chest", "machine"),
  w("Cable Fly", "chest", "cable"),
  w("Dip Machine", "chest", "machine"),
  bw("Push Up", "chest"),
  bw("Dip", "chest"),
  // Back
  w("Row Machine", "back", "machine"),
  w("Seated Cable Row", "back", "cable"),
  w("Chest Supported Row", "back", "machine"),
  w("Upper Back Dumbbell Row", "back", "dumbbell"),
  w("Single Arm Dumbbell Row", "back", "dumbbell"),
  w("Barbell Row", "back", "barbell"),
  w("T-Bar Row", "back", "machine"),
  w("Lat Pulldown Machine", "back", "machine"),
  w("Lat Pulldown", "back", "cable"),
  w("Close Grip Lat Pulldown", "back", "cable"),
  w("Straight Arm Pulldown", "back", "cable"),
  w("Assisted Pull Up", "back", "machine"),
  bw("Pull Up", "back"),
  bw("Chin Up", "back"),
  w("Face Pull", "rear delts", "cable"),
  w("Rear Delt Fly Machine", "rear delts", "machine"),
  w("Dumbbell Rear Delt Fly", "rear delts", "dumbbell"),
  w("Dumbbell Shrug", "traps", "dumbbell"),
  // Shoulders
  w("Lateral Raise", "shoulders", "dumbbell"),
  w("Cable Lateral Raise", "shoulders", "cable"),
  w("Lateral Raise Machine", "shoulders", "machine"),
  w("Seated Dumbbell Shoulder Press", "shoulders", "dumbbell"),
  w("Shoulder Press Machine", "shoulders", "machine"),
  w("Overhead Press", "shoulders", "barbell"),
  w("Arnold Press", "shoulders", "dumbbell"),
  w("Front Raise", "shoulders", "dumbbell"),
  w("Upright Row", "shoulders", "cable"),
  // Biceps
  w("Dumbbell Biceps Curl", "biceps", "dumbbell"),
  w("Dumbbell Hammer Curl", "biceps", "dumbbell"),
  w("Biceps Curl Machine", "biceps", "machine"),
  w("Preacher Curl", "biceps", "machine"),
  w("Barbell Curl", "biceps", "barbell"),
  w("EZ Bar Curl", "biceps", "ez bar"),
  w("Cable Curl", "biceps", "cable"),
  w("Incline Dumbbell Curl", "biceps", "dumbbell"),
  w("Bayesian Cable Curl", "biceps", "cable"),
  // Triceps
  w("Tricep Pushdown", "triceps", "cable"),
  w("Rope Tricep Pushdown", "triceps", "cable"),
  w("Overhead Tricep Extension", "triceps", "cable"),
  w("Skull Crusher", "triceps", "ez bar"),
  w("Tricep Extension Machine", "triceps", "machine"),
  w("Dumbbell Kickback", "triceps", "dumbbell"),
  w("Close Grip Bench Press", "triceps", "barbell"),
  // Core
  w("Ab Machine", "abs", "machine"),
  w("Cable Crunch", "abs", "cable"),
  bw("Hanging Knee Raise", "abs"),
  bw("Plank", "abs"),
  bw("Dead Bug", "abs"),
  bw("Crunch", "abs"),
  bw("Reverse Crunch", "abs"),
  w("Pallof Press", "obliques", "cable"),
  w("Russian Twist", "obliques", "medicine ball"),
  // Conditioning
  { name: "Treadmill Walk", kind: "duration", muscle: "cardio", equipment: "treadmill" },
  { name: "Incline Treadmill Walk", kind: "duration", muscle: "cardio", equipment: "treadmill" },
  { name: "Stairmaster", kind: "duration", muscle: "cardio", equipment: "stairmaster" },
  { name: "Stationary Bike", kind: "duration", muscle: "cardio", equipment: "bike" },
  { name: "Rowing Machine", kind: "distance", muscle: "cardio", equipment: "rower" },
  { name: "Elliptical", kind: "duration", muscle: "cardio", equipment: "elliptical" },
  { name: "Outdoor Walk", kind: "distance", muscle: "cardio", equipment: "none" },
  { name: "Run", kind: "distance", muscle: "cardio", equipment: "none" },
];
