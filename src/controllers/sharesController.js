import { query } from '../config/db.js';

// Récupérer toutes les actions avec calcul de performance/valeur actuelle
export const getShares = async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        id,
        company_name,
        ticker,
        quantity,
        buy_price,
        current_price,
        buy_date,
        notes,
        created_at,
        updated_at,
        (quantity * buy_price) as total_invested,
        (quantity * current_price) as current_val,
        ((quantity * current_price) - (quantity * buy_price)) as gain_loss,
        CASE 
          WHEN (quantity * buy_price) > 0 THEN (((current_price - buy_price) / buy_price) * 100)
          ELSE 0 
        END as gain_loss_percent
      FROM shares
      ORDER BY created_at DESC
    `);

    const shares = result.rows.map(row => {
      const quantity = parseFloat(row.quantity || 0);
      const buyPrice = parseFloat(row.buy_price || 0);
      const currentPrice = parseFloat(row.current_price || 0);
      const totalInvested = parseFloat(row.total_invested || (quantity * buyPrice));
      const currentVal = parseFloat(row.current_val || (quantity * currentPrice));
      const gainLoss = parseFloat(row.gain_loss || (currentVal - totalInvested));
      const gainLossPercent = totalInvested > 0 ? parseFloat(row.gain_loss_percent || (((currentPrice - buyPrice) / buyPrice) * 100)) : 0;

      return {
        ...row,
        quantity,
        buy_price: buyPrice,
        current_price: currentPrice,
        total_invested: totalInvested,
        current_val: currentVal,
        gain_loss: gainLoss,
        gain_loss_percent: gainLossPercent
      };
    });

    // Calculer les statistiques globales du portefeuille d'actions
    const statsResult = await query(`
      SELECT 
        COALESCE(SUM(quantity * buy_price), 0) as total_invested,
        COALESCE(SUM(quantity * current_price), 0) as total_current_value,
        COALESCE(SUM((quantity * current_price) - (quantity * buy_price)), 0) as total_gain_loss,
        COUNT(id) as total_positions
      FROM shares
    `);

    const stats = statsResult.rows[0];
    const totalInvested = parseFloat(stats.total_invested || 0);
    const totalCurrentVal = parseFloat(stats.total_current_value || 0);
    const totalGainLoss = parseFloat(stats.total_gain_loss || 0);
    const totalGainLossPercent = totalInvested > 0 ? ((totalCurrentVal - totalInvested) / totalInvested) * 100 : 0;

    res.json({
      shares,
      summary: {
        totalInvested,
        totalCurrentVal,
        totalGainLoss,
        totalGainLossPercent,
        totalPositions: parseInt(stats.total_positions || 0, 10)
      }
    });
  } catch (error) {
    console.error('Erreur getShares:', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des actions' });
  }
};

// Ajouter une nouvelle ligne d'actions
export const createShare = async (req, res) => {
  try {
    const { company_name, ticker, quantity, buy_price, current_price, buy_date, notes } = req.body;

    if (!company_name || quantity === undefined || buy_price === undefined) {
      return res.status(400).json({ error: 'Nom de l’entreprise, quantité et prix d’achat sont requis' });
    }

    const curPrice = current_price !== undefined && current_price !== '' ? current_price : buy_price;

    const result = await query(`
      INSERT INTO shares (company_name, ticker, quantity, buy_price, current_price, buy_date, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [company_name, ticker || null, quantity, buy_price, curPrice, buy_date || new Date(), notes || null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erreur createShare:', error);
    res.status(500).json({ error: 'Erreur lors de la création de la ligne d’actions' });
  }
};

// Mettre à jour une ligne d'actions (maj cours, quantité, prix, etc.)
export const updateShare = async (req, res) => {
  try {
    const { id } = req.params;
    const { company_name, ticker, quantity, buy_price, current_price, buy_date, notes } = req.body;

    const result = await query(`
      UPDATE shares 
      SET 
        company_name = COALESCE($1, company_name),
        ticker = COALESCE($2, ticker),
        quantity = COALESCE($3, quantity),
        buy_price = COALESCE($4, buy_price),
        current_price = COALESCE($5, current_price),
        buy_date = COALESCE($6, buy_date),
        notes = COALESCE($7, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `, [company_name, ticker, quantity, buy_price, current_price, buy_date, notes, id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action non trouvée' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur updateShare:', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour' });
  }
};

// Supprimer une ligne d'actions
export const deleteShare = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM shares WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Action non trouvée' });
    }

    res.json({ message: 'Action supprimée avec succès' });
  } catch (error) {
    console.error('Erreur deleteShare:', error);
    res.status(500).json({ error: 'Erreur lors de la suppression' });
  }
};
