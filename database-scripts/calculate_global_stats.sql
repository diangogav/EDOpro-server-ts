WITH wins AS (
    SELECT 
        w.user_id, 
        w.ban_list_name,
        COUNT(*)::int4 AS wins
    FROM 
        matches w
    WHERE 
        w.winner = TRUE
    GROUP BY 
        w.user_id, w.ban_list_name
),
losses AS (
    SELECT 
        l.user_id, 
        l.ban_list_name,
        (COUNT(*) - SUM(CASE WHEN l.winner = TRUE THEN 1 ELSE 0 END))::int4 AS losses
    FROM 
        matches l
    GROUP BY 
        l.user_id, l.ban_list_name
),
points AS (
    SELECT 
        p.user_id, 
        p.ban_list_name,
        SUM(p.points)::int4 AS total_points
    FROM 
        matches p
    GROUP BY 
        p.user_id, p.ban_list_name
),

global_stats AS (
    SELECT
        w.user_id,
        'Global' AS ban_list_name,
        SUM(w.wins) AS total_wins,
        SUM(l.losses) AS total_losses,
        SUM(p.total_points) AS total_points
    FROM wins w
    JOIN losses l ON w.user_id = l.user_id AND w.ban_list_name = l.ban_list_name
    JOIN points p ON w.user_id = p.user_id AND w.ban_list_name = p.ban_list_name
    GROUP BY w.user_id
)

INSERT INTO player_stats (user_id, ban_list_name, wins, losses, points)
SELECT 
    g.user_id,
    g.ban_list_name,
    g.total_wins AS wins,
    g.total_losses AS losses,
    g.total_points AS points
FROM global_stats g
ON CONFLICT (user_id, ban_list_name) 
DO UPDATE 
SET 
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    points = EXCLUDED.points;
