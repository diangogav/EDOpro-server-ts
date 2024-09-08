WITH wins AS (
    SELECT 
        user_id, 
        ban_list_name,
        COUNT(*)::int4 AS wins
    FROM 
        matches
    WHERE 
        winner = TRUE
    GROUP BY 
        user_id, ban_list_name
),
losses AS (
    SELECT 
        user_id, 
        ban_list_name,
        (COUNT(*) - SUM(CASE WHEN winner = TRUE THEN 1 ELSE 0 END))::int4 AS losses
    FROM 
        matches
    GROUP BY 
        user_id, ban_list_name
),
points AS (
    SELECT 
        user_id, 
        ban_list_name,
        SUM(points)::int4 AS total_points
    FROM 
        matches
    GROUP BY 
        user_id, ban_list_name
)

INSERT INTO player_stats (user_id, ban_list_name, wins, losses, points)
SELECT 
    w.user_id, 
    w.ban_list_name, 
    w.wins, 
    l.losses, 
    p.total_points
FROM 
    wins w
JOIN 
    losses l ON w.user_id = l.user_id AND w.ban_list_name = l.ban_list_name
JOIN 
    points p ON w.user_id = p.user_id AND w.ban_list_name = p.ban_list_name
ON CONFLICT (user_id, ban_list_name) 
DO UPDATE 
SET 
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    points = EXCLUDED.points;
