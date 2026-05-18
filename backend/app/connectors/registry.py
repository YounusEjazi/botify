from .gdrive import GDriveConnector
from .notion import NotionConnector

CONNECTOR_REGISTRY: dict[str, type] = {
    NotionConnector.kind: NotionConnector,
    GDriveConnector.kind: GDriveConnector,
}
