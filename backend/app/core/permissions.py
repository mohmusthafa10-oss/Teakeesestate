from enum import Enum
from typing import Dict, List, Set

class Permission(str, Enum):
    SELLERS_CREATE = "sellers.create"
    SELLERS_READ = "sellers.read"
    SELLERS_UPDATE = "sellers.update"
    SELLERS_DELETE = "sellers.delete"

    PROPERTIES_CREATE = "properties.create"
    PROPERTIES_READ = "properties.read"
    PROPERTIES_UPDATE = "properties.update"
    PROPERTIES_DELETE = "properties.delete"

    LEADS_CREATE = "leads.create"
    LEADS_READ = "leads.read"
    LEADS_UPDATE = "leads.update"
    LEADS_DELETE = "leads.delete"

    FOLLOWUPS_CREATE = "followups.create"
    FOLLOWUPS_READ = "followups.read"
    FOLLOWUPS_UPDATE = "followups.update"
    FOLLOWUPS_DELETE = "followups.delete"

    SITE_VISITS_MANAGE = "site_visits.manage"

    DEALS_CREATE = "deals.create"
    DEALS_READ = "deals.read"
    DEALS_UPDATE = "deals.update"
    DEALS_DELETE = "deals.delete"

    RENTALS_CREATE = "rentals.create"
    RENTALS_READ = "rentals.read"
    RENTALS_UPDATE = "rentals.update"
    RENTALS_DELETE = "rentals.delete"

    FINANCE_READ = "finance.read"
    FINANCE_MANAGE = "finance.manage"

    REPORTS_READ = "reports.read"
    USERS_MANAGE = "users.manage"
    SUBMISSIONS_CREATE = "submissions.create"
    SUBMISSIONS_READ = "submissions.read"
    SUBMISSIONS_UPDATE = "submissions.update"
    SUBMISSIONS_APPROVE = "submissions.approve"
    PROPERTIES_PUBLISH = "properties.publish"
    PROPERTIES_ASSIGN = "properties.assign"


ROLE_PERMISSIONS: Dict[str, Set[str]] = {
    "Admin": {p.value for p in Permission},
    "Agent": {
        Permission.SELLERS_CREATE.value,
        Permission.SELLERS_READ.value,
        Permission.SELLERS_UPDATE.value,
        Permission.PROPERTIES_CREATE.value,
        Permission.PROPERTIES_READ.value,
        Permission.PROPERTIES_UPDATE.value,
        Permission.LEADS_CREATE.value,
        Permission.LEADS_READ.value,
        Permission.LEADS_UPDATE.value,
        Permission.FOLLOWUPS_CREATE.value,
        Permission.FOLLOWUPS_READ.value,
        Permission.FOLLOWUPS_UPDATE.value,
        Permission.SITE_VISITS_MANAGE.value,
        Permission.DEALS_CREATE.value,
        Permission.DEALS_READ.value,
        Permission.DEALS_UPDATE.value,
        Permission.RENTALS_CREATE.value,
        Permission.RENTALS_READ.value,
        Permission.RENTALS_UPDATE.value,
        Permission.REPORTS_READ.value,
    },
    "Telecaller": {
        Permission.SELLERS_CREATE.value,
        Permission.SELLERS_READ.value,
        Permission.SELLERS_UPDATE.value,
        Permission.PROPERTIES_CREATE.value,
        Permission.PROPERTIES_READ.value,
        Permission.PROPERTIES_UPDATE.value,
        Permission.SUBMISSIONS_READ.value,
    }
}

def has_permission(role: str, permission: str) -> bool:
    role_perms = ROLE_PERMISSIONS.get(role, set())
    return permission in role_perms

