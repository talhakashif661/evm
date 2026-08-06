import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Gavel, CheckCircle2, XCircle, Trophy } from 'lucide-react';
import { fetchOwnerAuctions, fetchAuctionBids, clearAuctionBids } from '../store/slices/auctionSlice';
import { fetchMyStation } from '../store/slices/stationSlice';
import { Modal, EmptyState, Countdown } from '../components/Spinner';
import { Skeleton, SkeletonRow, SkeletonTableRows } from '../components/Skeleton';
import { toPKR } from '../utils/pkr';
import { getSocket } from '../utils/socket';
import api from '../utils/api';
import { logger } from '../utils/logger';
import SEO from '../components/SEO';
import Pagination from '../components/Pagination.jsx';

const STATUS_BADGE = {
  ACTIVE: 'badge-warning',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-cancelled',
};

const WINNER_STATUS_LABEL = {
  PENDING_CONFIRMATION: 'Pending Confirmation',
  CONFIRMED: 'Confirmed',
  EXPIRED: 'Expired',
  NO_WINNER: 'No Winner',
};

const winnerCell = (auction) => {
  if (!auction.winnerStatus) return '—';
  const label = WINNER_STATUS_LABEL[auction.winnerStatus] || auction.winnerStatus;
  return auction.winnerName ? `${auction.winnerName} — ${label}` : label;
};

export default function OwnerAuctions() {
  const dispatch = useDispatch();
  const { ownerAuctions, ownerAuctionsPagination, loading, bidsModal, bidsPagination, bidsLoading } =
    useSelector((s) => s.auctions);
  const { myStation } = useSelector((s) => s.stations);
  const [tab, setTab] = useState('ACTIVE');
  const [page, setPage] = useState(1);
  const [bidsPage, setBidsPage] = useState(1);
  // Tab badge counts reflect ALL auctions per status, not just the active
  // tab's current page — fetched separately (limit:1, only pagination.total
  // is read) so switching tabs doesn't require guessing at the other two.
  const [counts, setCounts] = useState({ ACTIVE: 0, COMPLETED: 0, CANCELLED: 0 });

  const fetchCounts = async () => {
    try {
      const [active, completed, cancelled] = await Promise.all(
        ['ACTIVE', 'COMPLETED', 'CANCELLED'].map((status) =>
          api.get('/auctions/owner', { params: { status, page: 1, limit: 1 } })
        )
      );
      setCounts({
        ACTIVE: active.data.pagination?.total ?? 0,
        COMPLETED: completed.data.pagination?.total ?? 0,
        CANCELLED: cancelled.data.pagination?.total ?? 0,
      });
    } catch (e) {
      logger.error(e);
    }
  };

  useEffect(() => {
    dispatch(fetchMyStation());
    fetchCounts();
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchOwnerAuctions({ status: tab, page, limit: 10 }));
  }, [dispatch, tab, page]);

  // Live updates: a new bid, a newly-opened auction, or one closing/cascading
  // should refresh this page the moment it happens, not only on reload — same
  // room-join pattern OwnerDashboard.jsx already uses for its own bid toast.
  useEffect(() => {
    if (!myStation) return;
    const socket = getSocket();
    socket.emit('join:station', myStation.id);

    const refresh = () => {
      dispatch(fetchOwnerAuctions({ status: tab, page, limit: 10 }));
      fetchCounts();
    };
    socket.on('bid:new', refresh);
    socket.on('auction:opened', refresh);
    socket.on('auction:closed', refresh);

    return () => {
      socket.emit('leave:station', myStation.id);
      socket.off('bid:new', refresh);
      socket.off('auction:opened', refresh);
      socket.off('auction:closed', refresh);
    };
  }, [dispatch, myStation, tab, page]);

  const tabs = [
    { id: 'ACTIVE', label: 'Active', icon: Gavel },
    { id: 'COMPLETED', label: 'Completed', icon: CheckCircle2 },
    { id: 'CANCELLED', label: 'Cancelled', icon: XCircle },
  ];
  const visible = ownerAuctions;

  const openBids = (auctionId) => {
    setBidsPage(1);
    dispatch(fetchAuctionBids({ auctionId, page: 1, limit: 10 }));
  };
  const closeBids = () => dispatch(clearAuctionBids());
  const changeBidsPage = (newPage) => {
    setBidsPage(newPage);
    if (bidsModal?.auction?.id) {
      dispatch(fetchAuctionBids({ auctionId: bidsModal.auction.id, page: newPage, limit: 10 }));
    }
  };

  if (loading && !ownerAuctions.length) {
    return (
      <div className="page-container">
        <Skeleton height={40} width="45%" style={{ marginBottom: 6 }} />
        <Skeleton height={16} width="60%" style={{ marginBottom: 28 }} />
        <div className="ev-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '0 20px' }}>
            {[...Array(4)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <SEO
        title="Station Auctions"
        description="Track active, completed, and cancelled auctions on your charging slots, and review every bid ranked by priority."
        noIndex
      />
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '2.6rem',
              fontWeight: 700,
              letterSpacing: '0.02em',
              marginBottom: 6,
            }}
          >
            Station <span style={{ color: 'var(--primary)' }}>Auctions</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            Every auction round on your slots — bids, timers, and winner status
          </p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 18px',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'Inter',
                fontWeight: 600,
                fontSize: '0.88rem',
                background: tab === t.id ? 'var(--primary-glow)' : 'var(--bg-elevated)',
                border: `1px solid ${tab === t.id ? 'var(--primary)' : 'var(--border)'}`,
                color: tab === t.id ? 'var(--primary)' : 'var(--text-secondary)',
                transition: 'background-color 0.12s ease, border-color 0.12s ease',
              }}
            >
              <t.icon size={14} /> {t.label} ({counts[t.id]})
            </button>
          ))}
        </div>

        {/* Auctions table */}
        <div className="ev-card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
            <h2
              style={{
                fontFamily: 'Inter',
                fontSize: '1.1rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              {tabs.find((t) => t.id === tab)?.label} Auctions
            </h2>
          </div>
          <div className="table-scroll">
            <table className="ev-table">
              <thead>
                <tr>
                  <th>Slot</th>
                  <th>Starting Bid</th>
                  <th>Highest Bid</th>
                  <th>Total Bids</th>
                  <th>Timer</th>
                  <th>Winner Status</th>
                  <th>Auction Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows rows={5} columns={8} />
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyState
                        icon={<Trophy size={48} color="var(--text-muted)" strokeWidth={1.5} />}
                        title={`No ${tab.toLowerCase()} auctions`}
                        subtitle="Open an auction on one of your slots to see it appear here."
                      />
                    </td>
                  </tr>
                ) : (
                  visible.map((a) => (
                    <tr key={a.id}>
                      <td style={{ color: 'var(--primary)', fontWeight: 600 }}>
                        #{a.slotNumber} · {a.powerKw}kW
                      </td>
                      <td>{toPKR(a.startingBid)}</td>
                      <td style={{ color: 'var(--gold)', fontWeight: 600 }}>
                        {a.currentHighestBid != null ? toPKR(a.currentHighestBid) : '—'}
                      </td>
                      <td>{a.totalBids}</td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {a.status === 'ACTIVE' ? (
                          <Countdown deadline={a.auctionEnd} />
                        ) : a.closedAt ? (
                          `Ended ${new Date(a.closedAt).toLocaleString()}`
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        {winnerCell(a)}
                      </td>
                      <td>
                        <span className={STATUS_BADGE[a.status] || 'badge-info'}>{a.status}</span>
                      </td>
                      <td>
                        <button
                          className="btn-outline"
                          style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                          onClick={() => openBids(a.id)}
                        >
                          View Bids
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          page={page}
          totalPages={ownerAuctionsPagination?.pages}
          onChange={setPage}
          variant="standalone"
          total={ownerAuctionsPagination?.total}
          limit={10}
        />
      </motion.div>

      {/* View Bids modal */}
      <Modal
        show={!!bidsModal}
        onClose={closeBids}
        title={bidsModal ? `Bids — Slot #${bidsModal.auction.slotNumber}` : 'Bids'}
      >
        {bidsLoading ? (
          <Skeleton height={140} />
        ) : (
          bidsModal && (
            <>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
                Ranked by priority — 60% bid amount + 40% battery urgency.
              </p>
              <div className="table-scroll">
                <table className="ev-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>User</th>
                      <th>Bid Amount</th>
                      <th>Battery</th>
                      <th>Priority</th>
                      <th>Bid Time</th>
                      <th>Confirmation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bidsModal.bids.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}
                        >
                          No bids were placed on this auction
                        </td>
                      </tr>
                    ) : (
                      bidsModal.bids.map((b) => (
                        <tr key={b.id}>
                          <td>#{b.rank}</td>
                          <td>{b.userName}</td>
                          <td style={{ color: 'var(--gold)', fontWeight: 600 }}>{toPKR(b.amount)}</td>
                          <td>{b.batteryLevel}%</td>
                          <td style={{ color: 'var(--info)', fontWeight: 600 }}>
                            {b.priority?.toFixed(1)}
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            {new Date(b.createdAt).toLocaleString()}
                          </td>
                          <td style={{ fontSize: '0.85rem' }}>{b.confirmationStatus}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={bidsPage}
                totalPages={bidsPagination?.pages}
                onChange={changeBidsPage}
                variant="standalone"
                total={bidsPagination?.total}
                limit={10}
              />
            </>
          )
        )}
      </Modal>
    </div>
  );
}
